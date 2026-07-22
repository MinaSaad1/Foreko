import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useProjectJob } from "../useProjectJob";

// A long validation blocks the backend hard enough that the browser drops the
// event stream. The run is still going, so the hook must ask the backend what
// happened instead of declaring the run dead.

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  static get latest() {
    return FakeEventSource.instances[FakeEventSource.instances.length - 1];
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function stubJobStatus(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status: ok ? 200 : 500,
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useProjectJob", () => {
  it("reopens the stream when the backend says the run is still going", async () => {
    stubJobStatus({
      status: "running",
      progress: { current: 7, total: 60, stage: "fold 2/5: arima" },
      result: null,
      error: null,
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { result } = renderHook(() => useProjectJob("p1"), { wrapper });
    act(() => result.current.track("job-1"));
    act(() => FakeEventSource.latest.onerror?.());

    // The reported progress must survive the drop, and the run must not be
    // reported as failed just because the stream ended.
    await waitFor(() => expect(result.current.progress?.current).toBe(7));
    expect(result.current.status).toBe("running");
    expect(result.current.error).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
  });

  it("picks up a result the run finished while the stream was gone", async () => {
    stubJobStatus({
      status: "done",
      progress: null,
      result: { series_count: 2 },
      error: null,
    });

    const { result } = renderHook(() => useProjectJob("p1"), { wrapper });
    act(() => result.current.track("job-1"));
    act(() => FakeEventSource.latest.onerror?.());

    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(result.current.result).toEqual({ series_count: 2 });
  });

  it("reports the run's own failure, not the dropped stream", async () => {
    stubJobStatus({
      status: "error",
      progress: null,
      result: null,
      error: "Dataset has no series after mapping.",
    });

    const { result } = renderHook(() => useProjectJob("p1"), { wrapper });
    act(() => result.current.track("job-1"));
    act(() => FakeEventSource.latest.onerror?.());

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("Dataset has no series after mapping.");
  });

  it("only reports a lost connection when the backend cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    const { result } = renderHook(() => useProjectJob("p1"), { wrapper });
    act(() => result.current.track("job-1"));
    act(() => FakeEventSource.latest.onerror?.());

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("Lost connection to the run.");
  });

  it("leaves a finished run alone when its stream closes", async () => {
    stubJobStatus({ status: "running", progress: null, result: null, error: null });

    const { result } = renderHook(() => useProjectJob("p1"), { wrapper });
    act(() => result.current.track("job-1"));
    const source = FakeEventSource.latest;
    act(() =>
      source.onmessage?.({ data: JSON.stringify({ type: "done", result: { ok: true } }) }),
    );
    act(() => source.onerror?.());

    expect(result.current.status).toBe("done");
    expect(FakeEventSource.instances).toHaveLength(1);
  });
});
