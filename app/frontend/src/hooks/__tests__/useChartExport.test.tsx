import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createRef, type RefObject } from "react";
import type ReactECharts from "echarts-for-react";
import { useChartExport } from "../useChartExport";

function makeMockChartRef(dataUrl = "data:image/png;base64,AAA") {
  const getDataURL = vi.fn(() => dataUrl);
  const ref = createRef<ReactECharts>() as RefObject<ReactECharts>;
  (ref as { current: unknown }).current = {
    getEchartsInstance: () => ({ getDataURL }),
  };
  return { ref, getDataURL };
}

function findAnchor(spy: { mock: { calls: unknown[][] } }): HTMLAnchorElement | null {
  for (const [node] of spy.mock.calls) {
    if (node instanceof HTMLAnchorElement) return node;
  }
  return null;
}

describe("useChartExport", () => {
  let clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click");
  let appendSpy = vi.spyOn(document.body, "appendChild");
  let removeSpy = vi.spyOn(document.body, "removeChild");
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => "blob:mock");
    revokeObjectURL = vi.fn();
    window.URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
    globalThis.fetch = vi.fn(
      async () => new Response(new Blob(["png-bytes"], { type: "image/png" })),
    ) as typeof fetch;
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    appendSpy = vi.spyOn(document.body, "appendChild");
    removeSpy = vi.spyOn(document.body, "removeChild");
  });

  afterEach(() => {
    clickSpy.mockRestore();
    appendSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("does nothing when chart ref is empty", async () => {
    const ref = createRef<ReactECharts>();
    const { result } = renderHook(() =>
      useChartExport(ref, { filename: "chart" }),
    );
    await act(async () => {
      await result.current.export();
    });
    expect(clickSpy).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("requests PNG with default bg, appends + removes anchor, revokes URL", async () => {
    const { ref, getDataURL } = makeMockChartRef();
    const { result } = renderHook(() =>
      useChartExport(ref, { filename: "comparison-chart" }),
    );

    await act(async () => {
      await result.current.export();
    });

    expect(getDataURL).toHaveBeenCalledWith({
      type: "png",
      backgroundColor: "#030712",
      pixelRatio: 3,
    });
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");

    const anchor = findAnchor(appendSpy);
    expect(anchor).not.toBeNull();
    expect(anchor!.download).toBe("comparison-chart.png");
    expect(removeSpy.mock.calls.some(([node]) => node === anchor)).toBe(true);
  });

  it("honors custom background + type options and does not double-suffix filename", async () => {
    const { ref, getDataURL } = makeMockChartRef("data:image/jpeg;base64,BBB");
    const { result } = renderHook(() =>
      useChartExport(ref, {
        filename: "out.jpeg",
        backgroundColor: "#ffffff",
        type: "jpeg",
      }),
    );

    await act(async () => {
      await result.current.export();
    });

    expect(getDataURL).toHaveBeenCalledWith({
      type: "jpeg",
      backgroundColor: "#ffffff",
      pixelRatio: 3,
    });
    const anchor = findAnchor(appendSpy);
    expect(anchor).not.toBeNull();
    expect(anchor!.download).toBe("out.jpeg");
  });
});
