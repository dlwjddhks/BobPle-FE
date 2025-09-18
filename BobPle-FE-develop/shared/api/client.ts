import { API_BASE } from '@/shared/constants/env';

function joinUrl(base: string, path: string) {
  const b = (base || '').replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

/** 공통 fetch (쿠키 포함, 객체 바디 자동 JSON) */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!API_BASE) {
    console.warn('[apiFetch] API_BASE is empty; check NEXT_PUBLIC_API_BASE');
  }
  const url = joinUrl(API_BASE, path);

  // ----- 바디/헤더 준비 -----
  let body = init.body as any;
  const isFormData   = typeof FormData !== 'undefined' && body instanceof FormData;
  const isURLParams  = typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams;
  const isBlob       = typeof Blob !== 'undefined' && body instanceof Blob;
  const isBufferView = typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView?.(body);
  const hasBody      = body !== undefined && body !== null;
  
  // 기존 headers를 보존하면서 조작하기 쉽게 Headers로 래핑
  const headers = new Headers(init.headers as HeadersInit | undefined);
try {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("authToken");
      if (token && !headers.has("authorization")) {
        headers.set("authorization", `Bearer ${token}`);
      }
    }
  } catch {}
  // accept 기본값 보정 (서버가 JSON 주는 경우가 대부분)
  if (!headers.has('accept')) {
    headers.set('accept', 'application/json'); // ★ 변경
  }

  // content-type이 미지정 && JSON으로 보낼 상황이면 지정
  const hasExplicitContentType = headers.has('content-type');
  const shouldSendJson =
    hasBody &&
    !isFormData &&
    !isURLParams &&
    !isBlob &&
    !isBufferView &&
    typeof body === 'object';

  if (shouldSendJson && !hasExplicitContentType) {
    headers.set('content-type', 'application/json');
  }

  // ★ 변경: body가 "문자열이지만 JSON"인 경우에도 content-type 자동 보정
  if (!shouldSendJson && hasBody && !hasExplicitContentType && typeof body === 'string') {
    try {
      JSON.parse(body); // 문자열이 JSON이면
      headers.set('content-type', 'application/json');
    } catch {
      // JSON이 아니면 건드리지 않음(text/plain 등)
    }
  }

  // 객체 바디 자동 JSON 직렬화
  if (shouldSendJson) {
    body = JSON.stringify(body);
  }

  // ----- fetch -----
  const res = await fetch(url, {
    credentials: 'include',                 // ★ 쿠키 전송 필수
    method: init.method ?? 'GET',
    headers,
    body,
    signal: (init as any).signal,
  });

  // 204/205 → 본문 없음
  if (res.status === 204 || res.status === 205) {
    return null as T;
  }

  // 텍스트로 일단 받고 JSON 시도
  const text = await res.text().catch(() => '');
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // 서버가 HTML/텍스트를 반환할 수도 있음 → data는 null 유지
  }

  if (!res.ok) {
    // ✅ 1) 프로필 조회 404는 정상 흐름으로 간주: 에러 던지지 않고 null 반환
    const isProfile404 =
      res.status === 404 &&
      (path.endsWith('/api/auth/profile') || path.includes('/api/auth/profile'));

    // ✅ 2) 선택: 호출부에서 okStatuses로 허용 상태를 넘기면 에러로 던지지 않음
    const okStatuses: number[] | undefined = (init as any)?.okStatuses;
    const isWhitelisted = Array.isArray(okStatuses) && okStatuses.includes(res.status);

    if (isProfile404 || isWhitelisted) {
      return (data as T) ?? (null as T);
    }

    console.warn('[apiFetch] error', {
      url,
      status: res.status,
      statusText: res.statusText,
      body: text,
    });
    const err = new Error(data?.message || `HTTP ${res.status}`) as Error & { status?: number; body?: string };
    err.status = res.status;
    err.body = text;
    throw err;
  }

  return (data as T) ?? ({} as T);
}