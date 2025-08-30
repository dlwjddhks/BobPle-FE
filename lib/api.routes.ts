// lib/api.routes.ts
// 공통 fetch 유틸: api.core.ts 의 apiRequest 사용
import { apiRequest } from "./api.core";
export type { Profile } from "./api.core";

/* ===== 타입 (ERD 기반) ===== */
export type EditEventDto = {
  title: string;
  content: string;
  start_at: string;   // ISO string
  end_at: string;     // ISO string
  restaurant_id?: number;
};

export type ApiOk = { success: boolean };
export type ApplyOk = { success: boolean; applicationId: number };
export type UpdateOk = { success: boolean; eventId: number };

/* ===== 내부 유틸: 여러 조합으로 시도 (404/미구현 대비) ===== */
async function tryMany<T>(tries: Array<{ path: string; method: "PUT" | "PATCH" | "GET" | "POST" | "DELETE"; body?: unknown }>) {
  let lastErr: any;
  for (const t of tries) {
    try {
      return await apiRequest<T>(t.path, {
        method: t.method,
        ...(t.body ? { body: JSON.stringify(t.body) } : {}),
      });
    } catch (e) {
      lastErr = e;
      // 다음 시도
    }
  }
  throw lastErr;
}

/* ===== 이벤트: 수정/삭제/신청/신청취소/내 이벤트 ===== */
export const eventAPI_mutation = {
  // PUT /api/events/{id}/edit | PUT /api/events/{id} | PATCH 조합까지 폴백
  updateEvent: async (eventId: number, eventData: any) => {
    try {
      // 1차: 기존 엔드포인트
      return await apiRequest(`/api/events/${eventId}/edit`, {
        method: "PUT",
        body: eventData,
      });
    } catch (err: any) {
      // 404면 PATCH로 재시도
      if (err?.status === 404) {
        return await apiRequest(`/api/events/${eventId}`, {
          method: "PATCH",
          body: eventData,
        });
      }
      throw err;
    }
  },

  deleteEvent: (eventId: number) =>
    apiRequest<ApiOk>(`/api/events/${encodeURIComponent(eventId)}/cancel`, { method: "DELETE" }),

  applyToEvent: (eventId: number, message?: string) =>
    apiRequest<ApplyOk>(`/api/events/${encodeURIComponent(eventId)}/application`, {
      method: "POST",
      ...(message ? { body: JSON.stringify({ message }) } : {}),
    }),

  cancelApplication: (eventId: number, applicationId: number) =>
    apiRequest<ApiOk>(
      `/api/events/${encodeURIComponent(eventId)}/application/${encodeURIComponent(applicationId)}/cancel`,
      { method: "DELETE" }
    ),

  getMyEvents: () => apiRequest(`/api/events/me`),
};

/* ===== 식당 =====
   - 명세 1순위: GET /api/restaurants?keyword=foo
   - 보조: GET /api/restaurants/search?q=foo, GET /api/restaurants?q=foo
   - 상세: GET /api/restaurants/{id}
*/
export type RestaurantListItem = { id: number; name: string; address?: string | null };
export type RestaurantDetail = { id: number; name: string; address?: string | null; tel?: string | null; category?: string | null };

export const restaurantAPI = {
  search: async (keyword: string): Promise<RestaurantListItem[]> => {
    const tries = [
      { path: `/api/restaurants?keyword=${encodeURIComponent(keyword)}`, method: "GET" as const },
      { path: `/api/restaurants/search?q=${encodeURIComponent(keyword)}`, method: "GET" as const },
      { path: `/api/restaurants?q=${encodeURIComponent(keyword)}`, method: "GET" as const },
    ];
    const res: any = await tryMany<any>(tries);
    const arr: any[] = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
    return arr.map((x) => ({
      id: Number(x.id),
      name: x.name ?? x.restaurantName ?? `식당 #${x.id}`,
      address: x.address ?? x.roadAddress ?? null,
    }));
  },

  getById: async (restaurantId: number): Promise<RestaurantDetail> => {
    const id = encodeURIComponent(restaurantId);
    const res: any = await apiRequest(`/api/restaurants/${id}`);
    const d = res?.data ?? res ?? {};
    return {
      id: Number(d.id ?? restaurantId),
      name: d.name ?? d.restaurantName ?? `식당 #${restaurantId}`,
      address: d.address ?? d.roadAddress ?? null,
      tel: d.tel ?? d.phone ?? null,
      category: d.category ?? d.type ?? null,
    };
  },
};

/* ===== 리뷰 ===== */
export const reviewAPI = {
  getUserReviews: (userId: number, page = 1, limit = 10, kind: "received" | "written" = "received") => {
    if (!Number.isFinite(userId)) throw new Error("reviewAPI.getUserReviews: Invalid userId");
    return apiRequest(
      `/api/reviews/${encodeURIComponent(userId)}?type=${kind}&page=${page}&limit=${limit}`
    );
  },

  createReview: (userId: number, review: { score: number; comment?: string; eventId: number }) => {
    if (!Number.isFinite(userId)) throw new Error("reviewAPI.createReview: Invalid userId");
    return apiRequest(`/api/reviews/${encodeURIComponent(userId)}`, {
      method: "POST",
      body: JSON.stringify(review),
    });
  },
};

/* ===== 댓글 ===== */
export const commentAPI = {
  getEventComments: (eventId: number | string) =>
    apiRequest(`/api/events/${encodeURIComponent(String(eventId))}/comments`),

  createComment: (eventId: number, content: string, creatorId: number) =>
    apiRequest(`/api/events/${encodeURIComponent(eventId)}/comments`, {
      method: "POST",
      body: JSON.stringify({
        content,
        creator_id: creatorId, // ERD snake_case
        event_id: eventId,     // ERD snake_case
      }),
    }),

  deleteComment: (eventId: number, commentId: number) =>
    apiRequest(`/api/events/${encodeURIComponent(eventId)}/comments/${encodeURIComponent(commentId)}`, {
      method: "DELETE",
    }),
};
