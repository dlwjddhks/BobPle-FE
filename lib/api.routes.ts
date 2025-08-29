// lib/api.routes.ts
// 친구 담당: 이벤트 “변경계열”, 댓글, 리뷰
// 공통 네트워킹 유틸은 api.core.ts 것을 사용

import { apiRequest } from "./api.core";
export type { Profile } from "./api.core";

/** 이벤트: 수정/삭제/신청/신청취소/내 이벤트 */
export const eventAPI_mutation = {
  updateEvent: async (eventId: number, eventData: any) =>
    apiRequest(`/api/events/${eventId}/edit`, {
      method: "PUT",
      body: JSON.stringify(eventData),
    }),

  deleteEvent: async (eventId: number) =>
    apiRequest(`/api/events/${eventId}/cancel`, {
      method: "DELETE",
    }),

  applyToEvent: async (eventId: number, message?: string) =>
    apiRequest(`/api/events/${eventId}/application`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),

  cancelApplication: async (eventId: number, applicationId: number) =>
    apiRequest(`/api/events/${eventId}/application/${applicationId}/cancel`, {
      method: "DELETE",
    }),

  getMyEvents: async () => apiRequest(`/api/events/me`),
};

/** 리뷰 */
export const reviewAPI = {
  getUserReviews: async (userId: number, page = 1, limit = 10, kind: "received" | "written" = "received") => {
    if (!Number.isFinite(userId)) throw new Error("reviewAPI.getUserReviews: Invalid userId");
    return apiRequest(`/api/reviews/${userId}?type=${kind}&page=${page}&limit=${limit}`);
  },

  createReview: async (
    userId: number,
    reviewData: { score: number; comment?: string; eventId: string }   // ⬅️ score 로 받기
  ) => {
    if (!Number.isFinite(userId)) throw new Error("reviewAPI.createReview: Invalid userId");
    return apiRequest(`/api/reviews/${userId}`, {
      method: "POST",
      body: JSON.stringify(reviewData), // { score, comment, eventId }
    });
  },
};
/** 댓글 */
export const commentAPI = {
  getEventComments: async (eventId: number | string) =>
    apiRequest(`/api/events/${encodeURIComponent(eventId)}/comments`),

  createComment: async (eventId: number, content: string) =>
    apiRequest(`/api/events/${eventId}/comments`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  deleteComment: async (eventId: number, commentId: number) =>
    apiRequest(`/api/events/${eventId}/comments/${commentId}`, {
      method: "DELETE",
    }),
};
