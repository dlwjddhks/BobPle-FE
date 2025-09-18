// lib/api.ts
/**
 * API 호출 엔드포인트 래퍼 모음
 * - 코어 유틸은 api.core.ts에서 import
 * - 외부 사용처는 계속 "@/lib/api" 에서 import
 */
import { apiRequest, refreshPOST, getAuthToken, API_BASE_URL } from "./api.core";
export { apiRequest, refreshPOST, getAuthToken, API_BASE_URL };
export type { Profile } from "./api.core";

import { eventAPI_mutation, commentAPI, reviewAPI } from "./api.routes";

/* ─────────────────────────────────────────────────────────────
   내부 공용 유틸
───────────────────────────────────────────────────────────── */
const toWireGender = (g: any): "Male" | "Female" | "None" | undefined => {
  if (g == null) return undefined;
  const s = String(g).trim().toLowerCase();

  if (s === "male") return "Male";
  if (s === "female") return "Female";
  if (s === "none") return "None";

  if (s === "남성" || s === "m") return "Male";
  if (s === "여성" || s === "f") return "Female";
  if (s === "상관없음" || s === "무관" || s === "n" || s === "선택안함") return "None";
  return undefined;
};

const toWireGrade = (v: any): number | undefined => {
  if (v == null) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;

  const s = String(v).trim();
  if (s.includes("대학원")) return 5;
  if (s.includes("졸업")) return 6;

  const n = parseInt(s.replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
};

/** 여러 시도를 순차적으로 수행(가장 먼저 성공한 응답을 반환) */
async function tryMany<T>(tries: Array<{ path: string; method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: any }>): Promise<T> {
  let lastErr: any;
  for (const t of tries) {
    try {
      const res = await apiRequest(t.path, {
        method: t.method || "GET",
        ...(t.body ? { body: JSON.stringify(t.body), headers: { "Content-Type": "application/json" } as any } : {}),
      });
      return (res?.data ?? res) as T;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export function getCurrentUser(): any | null {
  if (typeof window === "undefined") return null;
  const s = localStorage.getItem("user");
  return s ? JSON.parse(s) : null;
}
export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return !!getAuthToken();
}

/* ─────────────────────────────────────────────────────────────
   인증
───────────────────────────────────────────────────────────── */
export const authAPI = {
  login: async (email: string, password: string) => {
    const response = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (response?.success && (response?.token || response?.accessToken)) {
      const t = response?.token ?? response?.accessToken;
      localStorage.setItem("authToken", t);
    }
    if (response?.user) localStorage.setItem("user", JSON.stringify(response.user));
    if (response?.success || response?.user) localStorage.setItem("isLoggedIn", "true");
    return response;
  },

  loginWithIdToken: async (idToken: string) => {
    const response = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ idToken }),
    });
    const token =
      response?.token ??
      response?.accessToken ??
      response?.access_token ??
      response?.jwt ??
      response?.data?.token ??
      response?.data?.accessToken ?? null;
    if (token) localStorage.setItem("authToken", token);

    const user = response?.user ?? response?.success ?? null;
    if (user) localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("isLoggedIn", "true");
    return response;
  },

  logout: async () => {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } finally {
      localStorage.removeItem("authToken");
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");
      localStorage.removeItem("isLoggedIn");
    }
  },

  getProfile: async () => {
    try {
      const refreshed = await refreshPOST();
      const me = refreshed?.user ?? refreshed ?? null;
      if (me?.id) {
        localStorage.setItem("user", JSON.stringify(me));
        localStorage.setItem("isLoggedIn", "true");
      }
      return me;
    } catch {
      return null;
    }
  },

  updateProfile: async (profileData: { grade: any; gender: any; nickname: string }) => {
    const grade = toWireGrade(profileData.grade);
    const gender = toWireGender(profileData.gender);
    const nickname = (profileData.nickname ?? "").trim();

    if (grade == null || !gender || nickname.length === 0) {
      throw new Error("학년, 성별, 닉네임은 모두 입력해야 합니다.");
    }

    const payload = { grade, gender, nickname };

    return apiRequest("/api/auth/profile/", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
};

/* ─────────────────────────────────────────────────────────────
   사용자
───────────────────────────────────────────────────────────── */
export const userAPI = {
  getUserProfile: async (userId: number) => apiRequest(`/api/users/${userId}`),
};

/* ─────────────────────────────────────────────────────────────
   이벤트 (읽기/생성 등)
───────────────────────────────────────────────────────────── */
export const eventAPI_read = {
  createEvent: async (eventData: any) => {
    const data = await apiRequest("/api/events/creation", {
      method: "POST",
      body: JSON.stringify(eventData),
      headers: { "Content-Type": "application/json" } as any,
    });
    return data;
  },

  getEvents: async (params?: { search?: string; page?: number; size?: number }) => {
    const sp = new URLSearchParams();
    if (params) Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "") sp.append(k, String(v));
    });
    const q = sp.toString();

    const raw = await apiRequest(`/api/events${q ? `?${q}` : ""}`);
    const data = (raw && typeof raw === "object" && "data" in raw) ? (raw as any).data : raw;

    const items =
      Array.isArray(data?.items)  ? data.items  :
      Array.isArray(data?.events) ? data.events :
      Array.isArray(data)         ? data       : [];

    const page  = data?.pagination?.page  ?? data?.page  ?? params?.page  ?? 1;
    const size  = data?.pagination?.size  ?? data?.size  ?? params?.size  ?? items.length;
    const total = data?.pagination?.total ?? data?.total ?? items.length;

    return { items, page, size, total };
  },

  getEvent: async (eventId: number | string) => {
    const eid = String(eventId ?? "").trim();
    if (!eid) return null;

    const res = await apiRequest(`/api/events/${encodeURIComponent(eid)}`);
    const raw = (res as any)?.data?.item ?? (res as any)?.data ?? (res as any)?.item ?? res;

    const pick = (obj: any, ...keys: string[]) => {
      for (const k of keys) if (obj?.[k] !== undefined) return obj[k];
      return null;
    };

    const startISO = pick(raw, "startAt", "start_at");
    const endISO   = pick(raw, "endAt", "end_at");

    const creator = raw?.creator ?? raw?.user ?? null;
    const creatorId = pick(creator ?? raw, "id", "creatorId", "userId");
    const creatorNickname =
      pick(creator ?? raw, "nickname", "name", "creatorNickname") ?? null;

    const restaurant = raw?.restaurant ?? null;
    const restaurantId =
      pick(restaurant ?? raw, "id", "restaurantId", "restaurant_id");
    const restaurantName =
      pick(restaurant ?? raw, "name", "restaurantName") ?? null;
    const restaurantAddress =
      pick(restaurant ?? raw, "address", "roadAddress", "restaurantAddress") ?? null;

    const participants =
      Array.isArray(raw?.participants) ? raw.participants : [];
    const participantsCount =
      pick(raw, "participantsCount", "participants_count") ??
      (Array.isArray(participants) ? participants.length : 0);

    const maxParticipants = pick(raw, "maxParticipants", "max_participants");

    return {
      id: raw?.id ?? eid,
      title: raw?.title ?? "제목 없음",
      content: raw?.content ?? raw?.description ?? "",
      startISO,
      endISO,
      restaurantId,
      restaurantName,
      restaurantAddress,
      creatorId,
      creatorNickname,
      participants,
      participantsCount,
      maxParticipants,
    };
  },
};

/* ─────────────────────────────────────────────────────────────
   웹소켓 (서버 요구: /ws/chats?eventId=123&token=xxx)
───────────────────────────────────────────────────────────── */
export type ChatMessage = {
  id?: number | string;
  userId?: number | null;
  content: string;
  createdAt?: string; // ISO
};

export function openChatSocket(
  eventId: number,
  opts?: {
    token?: string;
    onMessage?: (msg: any) => void;
    onOpen?: () => void;
    onClose?: (ev: CloseEvent) => void;
    onError?: (ev: Event) => void;
  }
) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "";

// http → ws, https → wss 변환 함수
const fromHttpToWs = (u: string) =>
  u.replace(/^http:\/\//i, "ws://").replace(/^https:\/\//i, "wss://");

const wsBase = process.env.NEXT_PUBLIC_WS_URL || fromHttpToWs(apiBase);
const base   = wsBase.replace(/\/+$/, "");

  const token =
    opts?.token ||
    (typeof window !== "undefined"
      ? localStorage.getItem("authToken") || localStorage.getItem("accessToken") || ""
      : "");

  // ✅ 쿼리 방식으로 eventId & token 전달
  const url =
    `${base}/ws/chats?eventId=${encodeURIComponent(eventId)}` +
    (token ? `&token=${encodeURIComponent(token)}` : "");

  const ws = new WebSocket(url);

  ws.addEventListener("open", () => {
    // 서버가 system 메시지를 내려주므로 join 메시지는 필요 없음
    opts?.onOpen?.();
  });
  ws.addEventListener("message", (e) => {
    let data: any = e.data;
    try { data = JSON.parse(e.data); } catch {}
    opts?.onMessage?.(data);
  });
  ws.addEventListener("close", (ev) => opts?.onClose?.(ev));
  ws.addEventListener("error", (ev) => opts?.onError?.(ev));

  return ws;
}

/* ─────────────────────────────────────────────────────────────
   채팅 (스웨거 스펙과 일치)
   - GET  /api/chats/{eventId}?size[&cursor]
   - POST /api/chats/{eventId}
   - PATCH /api/chats/{eventId}
───────────────────────────────────────────────────────────── */
export type ChatHistory = {
  items: ChatMessage[];
  nextCursor?: number | string | null;
};

export const chatAPI = {
  /** 채팅방 내용 불러오기
   * - size 기본 30
   * - 최초 조회: cursor 미전송
   * - 다음 페이지: 서버가 준 nextCursor(≥1)만 cursor로 전송
   */
  async getChatRoom(
    eventId: number,
    opts?: { cursor?: number | string; size?: number }
  ): Promise<ChatHistory> {
    const size = Number.isFinite(Number(opts?.size)) ? Number(opts?.size) : 30;

    const sp = new URLSearchParams();
    sp.set("size", String(size));

    if (opts?.cursor != null) {
      const c = Number(opts.cursor);
      if (Number.isInteger(c) && c >= 1) sp.set("cursor", String(c));
    }

    const qs = sp.toString();
    const res = await apiRequest(`/api/chats/${encodeURIComponent(eventId)}${qs ? `?${qs}` : ""}`);

    const body = (res as any)?.data ?? res;
    const rawItems: any[] =
      Array.isArray(body?.items) ? body.items :
      Array.isArray(body)        ? body       : [];
    const nextCursor = body?.nextCursor ?? body?.next_cursor ?? null;

    const items: ChatMessage[] = rawItems.map((m: any) => ([
      "id","userId","content","createdAt"
    ].reduce((acc, _) => acc, {
      id: m.id,
      userId: m.userId ?? m.user_id ?? m.user?.id ?? null,
      content: String(m.content ?? m.message ?? m.text ?? ""),
      createdAt: String(m.createdAt ?? m.created_at ?? new Date().toISOString()),
    })));

    return { items, nextCursor };
  },

  /** 메시지 전송(WS 실패 시 폴백) */
  async sendMessage(eventId: number, payload: { content: string }) {
    try {
      return await apiRequest(`/api/chats/${encodeURIComponent(eventId)}`, {
        method: "POST",
        body: JSON.stringify({ content: payload.content }),
        headers: { "Content-Type": "application/json" } as any,
      });
    } catch {
      try {
        return await apiRequest(`/api/chats/${encodeURIComponent(eventId)}`, {
          method: "POST",
          body: JSON.stringify({ content: payload.content, eventId }),
          headers: { "Content-Type": "application/json" } as any,
        });
      } catch {
        return await apiRequest(`/api/chats/${encodeURIComponent(eventId)}`, {
          method: "POST",
          body: JSON.stringify({ content: payload.content, event_id: eventId }),
          headers: { "Content-Type": "application/json" } as any,
        });
      }
    }
  },

  /** 채팅방 나가기 */
  async leaveChat(eventId: number) {
    return apiRequest(`/api/chats/${encodeURIComponent(eventId)}`, { method: "PATCH" });
  },
};

/* ─────────────────────────────────────────────────────────────
   알림
───────────────────────────────────────────────────────────── */
export const notificationAPI = {
  getNotifications: async (params?: { unreadOnly?: boolean; type?: string; page?: number; size?: number }) => {
    const sp = new URLSearchParams();
    if (params)
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== "") sp.append(k, String(v));
      });
    const q = sp.toString();
    return apiRequest(`/api/notifications${q ? `?${q}` : ""}`);
  },
  markAsRead: async (notificationId: string) =>
    apiRequest(`/api/notifications/${notificationId}`, { method: "PATCH", body: JSON.stringify({ isRead: true }) }),
  deleteNotification: async (notificationId: string) =>
    apiRequest(`/api/notifications/${notificationId}`, { method: "DELETE" }),
  createNotification: async (notificationData: {
    eventId: string; participantIds: number[]; type: string; title: string; message: string; actionData?: any;
  }) => apiRequest("/api/notification", { method: "POST", body: JSON.stringify(notificationData) }),
};

/* ─────────────────────────────────────────────────────────────
   추천 식당
───────────────────────────────────────────────────────────── */
export const restaurantAPI = {
  search: async (params?: {
    q?: string; location?: string; category?: string; sponsoredOnly?: 0 | 1; page?: number; size?: number;
  }) => {
    const sp = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") sp.append(k, String(v));
      });
    }
    const qs = sp.toString();
    return apiRequest(`/api/restaurants${qs ? `?${qs}` : ""}`);
  },

  getRecommendations: async (params?: { category?: string; location?: string; priceRange?: string; size?: number }) => {
    const sp = new URLSearchParams();
    if (params) Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "") sp.append(k, String(v));
    });
    const qs = sp.toString();
    return apiRequest(`/api/restaurants/recommends${qs ? `?${qs}` : ""}`);
  },

  async getById(id: number) {
    const res = await apiRequest(`/api/restaurants/${id}`);
    const body = (res && typeof res === "object" && "data" in res) ? (res as any).data : res;
    return {
      id: Number(body?.id ?? id),
      name: String(body?.name ?? body?.restaurantName ?? ""),
      address: (body?.address ?? body?.roadAddress ?? null) as string | null,
    };
  },
};

/* ─────────────────────────────────────────────────────────────
   합성 Export
───────────────────────────────────────────────────────────── */
export const eventAPI = { ...eventAPI_mutation, ...eventAPI_read };
export { commentAPI, reviewAPI };
