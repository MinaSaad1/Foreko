export class ApiError extends Error {
  status: number;
  detail?: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    let detail: unknown = text;
    try {
      detail = JSON.parse(text);
    } catch {
      // keep raw text
    }
    const msg =
      typeof detail === "object" && detail !== null && "detail" in detail
        ? String((detail as { detail: unknown }).detail)
        : text || res.statusText;
    throw new ApiError(res.status, msg, detail);
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
  signal?: AbortSignal,
): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`/api${path}`, {
    method: "POST",
    body: form,
    signal,
  });
  return handle<T>(res);
}
