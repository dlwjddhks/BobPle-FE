import { apiFetch } from '@/shared/api/client';

export type ChatMessage = {
  id: number;
  chat_id: number;
  sender_id: number;
  content: string;
  created_at: string;
};

export const getChat = (chatId: number) =>
  apiFetch<ChatMessage[]>(`/api/chats/${chatId}`);

export const postChatMessage = (chatId: number, payload: { message: string }) =>
  apiFetch<{ ok: boolean }>(`/api/chats/${chatId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const patchLeaveChat = (chatId: number) =>
  apiFetch<{ ok: boolean }>(`/api/chats/${chatId}`, { method: 'PATCH' });
