import { apiFetch } from '@/shared/api/client';

/** 댓글 작성 */
export function postComment(eventId: number, payload: { content: string }) {
  return apiFetch(`/api/events/${eventId}/comments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** 댓글 목록 */
export function getComments(eventId: number) {
  return apiFetch<CommentItem[]>(`/api/events/${eventId}/comments`);
}

/** 댓글 삭제 */
export function deleteComment(eventId: number, commentId: number) {
  return apiFetch<{ ok: boolean }>(`/api/events/${eventId}/comments/${commentId}`, {
    method: 'DELETE',
  });
}

export type CommentItem = {
  id: number;
  event_id: number;
  creator_id: number;
  content: string;
  created_at: string;
};
