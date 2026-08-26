const PW_KEY = "aax_pw";
const TOKEN_KEY = "aax_token";

export function getPassword(): string {
  return localStorage.getItem(PW_KEY) ?? "";
}
export function setPassword(pw: string): void {
  localStorage.setItem(PW_KEY, pw);
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

/** Clears password + session token on this device. */
export function clearSession(): void {
  localStorage.removeItem(PW_KEY);
  localStorage.removeItem(TOKEN_KEY);
}
/** @deprecated use clearSession */
export const clearPassword = clearSession;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...opts,
    headers: {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(getPassword() ? { "x-auth-password": getPassword() } : {}),
      ...(getToken() ? { "x-auth-token": getToken() } : {}),
    },
  });
  if (res.status === 401) throw new ApiError(401, "unauthorized");
  let data: unknown = {};
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const msg = (data as { error?: string }).error ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(p: string) => request<T>(p, { method: "DELETE" }),
};
