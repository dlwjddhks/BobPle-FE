import { apiFetch } from '@/shared/api/client';
import { getMyProfile, putMyProfile } from "@/features/auth/auth.repository";

/**
 * 이벤트 리스트 조회
 * @returns {Promise<EventSummary[]>}
 */
export function getEvents() {
  return apiFetch<EventSummary[]>('/api/events');
}

/**
 * 이벤트 상세 조회
 * @param {number} id - 이벤트 ID
 * @returns {Promise<EventDetail>}
 */
export function getEvent(id: number) {
  return apiFetch<EventDetail>(`/api/events/${id}`);
}

/** 이벤트 생성 */
export function postEventCreate(payload: EventCreateDto) {
  return apiFetch<EventDetail>('/api/events/creation', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** 이벤트 수정 */
export function putEventEdit(eventId: number, payload: Partial<EventCreateDto>) {
  return apiFetch<EventDetail>(`/api/events/${eventId}/edit`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/** 이벤트 삭제 */
export function deleteEvent(eventId: number) {
  return apiFetch<{ ok: boolean }>(`/api/events/${eventId}/cancel`, { method: 'DELETE' });
}

/** 신청 / 신청 취소 */
export function postApply(eventId: number) {
  return apiFetch<{ ok: boolean }>(`/api/events/${eventId}/application`, { method: 'POST' });
}
export function deleteApply(eventId: number, applicationId: number) {
  return apiFetch<{ ok: boolean }>(`/api/events/${eventId}/application/${applicationId}/cancel`, {
    method: 'DELETE',
  });
}

/* ===== Types ===== */
export type EventCreateDto = {
  title: string;
  content: string;
  restaurant_id: number;
  start_at: string; // ISO
  end_at: string;   // ISO
};

export type EventSummary = {
  id: number;
  title: string;
  start_at: string;
  end_at: string;
  restaurant_id: number;
  creator_id: number;
};

export type EventDetail = EventSummary & {
  content: string;
  created_at: string;
  updated_at?: string | null;
};
