import { apiFetch } from '@/shared/api/client';

export type NotificationItem = {
  id: number;
  title: string;
  content: string;
  created_at: string;
  read?: boolean;
};

export const getNotifications = () => apiFetch<NotificationItem[]>('/api/notifications');
export const patchReadNotification = (notificationId: number) =>
  apiFetch<{ ok: boolean }>(`/api/notifications/${notificationId}`, { method: 'PATCH' });
