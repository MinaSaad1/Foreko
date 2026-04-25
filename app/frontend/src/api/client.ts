export class ApiError extends Error {
  status: number;
  detail?: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

function extractMessage(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    // FastAPI/Pydantic validation errors: [{loc, msg, type}, ...]
    const parts = detail
      .map((item) => {
        if (item && typeof item === "object") {
          const rec = item as Record<string, unknown>;
          const loc = Array.isArray(rec.loc) ? rec.loc.join(".") : undefined;
          const msg = typeof rec.msg === "string" ? rec.msg : undefined;
          if (loc && msg) return `${loc}: ${msg}`;
          if (msg) return msg;
        }
        return typeof item === "string" ? item : "";
      })
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  if (detail && typeof detail === "object") {
    const rec = detail as Record<string, unknown>;
    if (typeof rec.message === "string" && rec.message.trim()) return rec.message;
    if (typeof rec.error === "string" && rec.error.trim()) return rec.error;
  }
  return fallback;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // keep raw text
    }
    const payloadDetail =
      parsed && typeof parsed === "object" && "detail" in parsed
        ? (parsed as { detail: unknown }).detail
        : parsed;
    const msg = extractMessage(payloadDetail, text || res.statusText || `HTTP ${res.status}`);
    throw new ApiError(res.status, msg, parsed);
  }
  return (await res.json()) as T;
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, { signal });
  return handle<T>(res);
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  return handle<T>(res);
}

export async function apiUpload<T>(
  path: string,
  file: File,
  options?: { query?: Record<string, string | undefined>; signal?: AbortSignal },
): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const query = options?.query
    ? Object.entries(options.query)
        .filter((entry): entry is [string, string] => entry[1] !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&")
    : "";
  const url = `/api${path}${query ? `?${query}` : ""}`;
  const res = await fetch(url, {
    method: "POST",
    body: form,
    signal: options?.signal,
  });
  return handle<T>(res);
}
