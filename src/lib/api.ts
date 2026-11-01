/**
 * Same-origin API client. Auth rides on the HttpOnly `ss_session` cookie, so no token is ever
 * read or stored in JS. A 401 from any call means the session ended (logout elsewhere, password
 * or role change, expiry): we broadcast `auth-expired` and the AuthProvider signs the user out.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly data: unknown;
  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export const AUTH_EXPIRED_EVENT = "auth-expired";

/** Endpoints where a 401 is an expected answer, not a lost session. */
const SILENT_401 = ["/api/auth/me", "/api/auth/login", "/api/auth/register"];

type ApiInit = Omit<RequestInit, "body"> & { body?: unknown };

/**
 * fetch() with the session cookie, JSON in and out, and errors as ApiError.
 * Plain objects/arrays in `body` are JSON-encoded; FormData/Blob/strings pass through.
 */
export async function apiFetch<T = unknown>(path: string, init: ApiInit = {}): Promise<T> {
  const { body, headers, ...rest } = init;
  const h = new Headers(headers);
  let payload: BodyInit | undefined;
  if (body === undefined || body === null) {
    payload = undefined;
  } else if (
    typeof body === "string" ||
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer
  ) {
    payload = body as BodyInit;
  } else {
    payload = JSON.stringify(body);
    if (!h.has("Content-Type")) h.set("Content-Type", "application/json");
  }

  const res = await fetch(path, { ...rest, headers: h, body: payload, credentials: "include" });

  const pathname = path.split(/[?#]/)[0];
  if (res.status === 401 && !SILENT_401.includes(pathname)) {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
  }

  if (res.status === 204) return undefined as T;
  const type = res.headers.get("Content-Type") ?? "";
  const data: unknown = type.includes("application/json") ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : null) ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message, data);
  }
  return data as T;
}
