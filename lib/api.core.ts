/**
 * 코어 네트워킹 유틸 (공유)
 * - API_BASE_URL
 * - getAuthToken
 * - apiRequest (로그인/리프레시에 Authorization 제외)
 * - refreshPOST (POST /api/auth/refresh, 슬래시 유/무 백업)
 * - 타입(Profile)
 */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

/** 로컬 스토리지 토큰(겸용) */
export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("authToken") || localStorage.getItem("accessToken");
}

/** ✅ 공통 fetch: 쿠키 포함 */

// URL 깔끔 합치기 (proxy/직접호출 둘 다 안전)
function joinPath(base: string, path: string) {
  if (!base) return path;
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export async function apiRequest<T = any>(
  endpoint: string,
  init: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();

  const isLoginCall   = endpoint.startsWith("/api/auth/login");
  const isRefreshCall = endpoint.startsWith("/api/auth/refresh");

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    // 로그인/리프레시는 Bearer 제외, 나머지는 있으면 붙임
    ...(!isLoginCall && !isRefreshCall && token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers || {}),
  };

  const url = joinPath(API_BASE_URL, endpoint);
  const res = await fetch(url, {
    credentials: "include",          // ★ 세션 쿠키 유지(프록시용)
    ...init,
    headers,
  });

  // 204 No Content → 기존대로 null 유지(호환성)
  if (res.status === 204) return null as unknown as T;

  const ct = res.headers.get("content-type") || "";

  // ★ 401 → refresh(POST) 시도 후 1회 재시도
  if (res.status === 401 && !isRefreshCall) {
    const refreshed = await refreshPOST().catch(() => null);
    if (refreshed?.user) {
      localStorage.setItem("user", JSON.stringify(refreshed.user));
      localStorage.setItem("isLoggedIn", "true");
      return apiRequest<T>(endpoint, init);
    }
    localStorage.removeItem("authToken");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("user");
    localStorage.removeItem("isLoggedIn");
    throw new Error("세션이 만료되었습니다. 다시 로그인해주세요.");
  }

  // 에러 응답 body 파싱(친구 코드 스타일)
  if (!res.ok) {
    const body = ct.includes("application/json")
      ? await res.json().catch(() => null)
      : await res.text().catch(() => "");
    const message =
      (typeof body === "object" && body && (body.message || body.error)) ||
      (typeof body === "string" && body) ||
      `HTTP ${res.status}`;
    const err = new Error(message) as Error & { status?: number; body?: any };
    err.status = res.status;
    err.body = body;
    throw err;
  }

  if (!ct.includes("application/json")) {
    const txt = await res.text().catch(() => "");
    if (!txt) return null as unknown as T;   // 필요하면 여기서도 null 반환
    throw new Error(`Non-JSON response from ${endpoint}`);
  }

  return res.json() as Promise<T>;
}

/** refresh: POST 한 가지(슬래시 유무만 백업 시도) */
export async function refreshPOST(): Promise<any | null> {
  // 1차: /api/auth/refresh (POST)
  let r = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }).catch(() => null);

  // 실패 시 2차: /api/auth/refresh/ (POST)
  if (!r || !r.ok) {
    r = await fetch(`${API_BASE_URL}/api/auth/refresh/`, {
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
