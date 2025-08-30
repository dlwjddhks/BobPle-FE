// lib/api.core.ts

/**
 * 공용 네트워킹 유틸
 * - Authorization 자동 부착(localStorage -> cookie fallback)
 * - JSON 바디 자동 처리(FormData/Blob/ArrayBuffer 제외)
 * - 401 시 refresh 1회 후 재시도
 * - 네트워크/HTTP 에러 상세 콘솔 로그
 */

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");

/* ───────── 토큰 얻기: localStorage → cookie fallback ───────── */
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;

  const ls =
    localStorage.getItem("authToken") ||
    localStorage.getItem("accessToken");
  if (ls) return ls;

  // accessToken 이거나 오타(accesToken)도 허용
  const ck =
    getCookie("accessToken") ||
    getCookie("accesToken") ||
    null;

  if (ck) {
    try { localStorage.setItem("authToken", ck); } catch {}
    return ck;
  }
  return null;
}

/* ───────── 유틸 ───────── */
function joinPath(base: string, path: string) {
  if (!base) return path;
  return `${base.replace(/\/+$/, "")}/${String(path || "").replace(/^\/+/, "")}`;
}
function isBinaryBody(v: any) {
  return v instanceof FormData || v instanceof Blob || v instanceof ArrayBuffer;
}
function looksLikeJsonString(s: string) {
  const t = s.trim();
  return t.startsWith("{") || t.startsWith("[");
}

/* ───────── 공통 요청 ───────── */
export async function apiRequest<T = any>(
  endpoint: string,
  init: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const isLoginCall   = endpoint.startsWith("/api/auth/login");
  const isRefreshCall = endpoint.startsWith("/api/auth/refresh");

  const headers = new Headers(init.headers || {});
  let body: any = init.body;

  // ① Content-Type 처리 (문자열 JSON도 자동 세팅)
  if (!headers.has("Content-Type") && !isBinaryBody(body as any)) {
    if (typeof body === "string") {
      if (looksLikeJsonString(body)) headers.set("Content-Type", "application/json");
    } else if (body && typeof body === "object") {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(body);
    }
  } else if (!isBinaryBody(body as any) && body && typeof body === "object" && !(typeof body === "string")) {
    // 사용자가 Content-Type을 이미 지정했어도, 객체면 stringify는 해줌
    body = JSON.stringify(body);
  }

  // ② Authorization 자동 부착 (로그인/리프레시는 제외, 사용자가 명시했으면 존중)
  if (!isLoginCall && !isRefreshCall && token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const url = joinPath(API_BASE_URL, endpoint);

  // 네트워크 레벨 에러 로그
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: init.credentials ?? "include",
      cache: init.cache ?? "no-store",
      ...init,
      headers,
      body,
    });
  } catch (networkErr: any) {
    console.error("[apiRequest][NETWORK ERROR]", {
      url,
      method: init.method || "GET",
      message: networkErr?.message || String(networkErr),
      error: networkErr,
    });
    throw networkErr;
  }

  if (res.status === 204) return null as unknown as T;

  const ct = res.headers.get("content-type") || "";

  // ③ 401 처리: refresh 1회 후 재시도
  if (res.status === 401 && !isRefreshCall) {
    const refreshed = await refreshPOST().catch(() => null);
    if (refreshed?.user) {
      localStorage.setItem("user", JSON.stringify(refreshed.user));
      localStorage.setItem("isLoggedIn", "true");
      const newToken =
        refreshed?.token ??
        refreshed?.accessToken ??
        refreshed?.access_token ??
        null;
      if (newToken) localStorage.setItem("authToken", newToken);
      return apiRequest<T>(endpoint, init);
    }
    localStorage.removeItem("authToken");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("user");
    localStorage.removeItem("isLoggedIn");
    const e401: any = new Error("세션이 만료되었습니다. 다시 로그인해주세요.");
    e401.status = 401;
    throw e401;
  }

  // HTTP 에러 상세 로그
  if (!res.ok) {
    const payload = ct.includes("application/json")
      ? await res.json().catch(() => null)
      : await res.text().catch(() => "");
    console.error("[apiRequest][HTTP ERROR]", {
      url,
      method: init.method || "GET",
      status: res.status,
      statusText: res.statusText,
      payload,
    });
    const message =
      (payload && (payload.message || payload.error)) ||
      (typeof payload === "string" && payload) ||
      `HTTP ${res.status}`;
    const err: any = new Error(message);
    err.status = res.status;
    err.body = payload;
    err.url = url;
    throw err;
  }

  if (!ct.includes("application/json")) {
    const txt = await res.text().catch(() => "");
    return (txt as unknown) as T;
  }
  return res.json() as Promise<T>;
}

/* refresh: POST 한 가지(슬래시 유무 백업) */
export async function refreshPOST(): Promise<any | null> {
  let r = await fetch(joinPath(API_BASE_URL, "/api/auth/refresh"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }).catch(() => null);

  if (!r || !r.ok) {
    r = await fetch(joinPath(API_BASE_URL, "/api/auth/refresh/"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => null);
  }
  if (!r || !r.ok) return null;

  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return null;
  return r.json().catch(() => null);
}

export type Profile = {
  id?: number | string;
  grade: number | null;
  gender: "Male" | "Female" | "None" | null;
  nickname?: string | null;
  isCompleted?: boolean;
  is_completed?: boolean;
};
