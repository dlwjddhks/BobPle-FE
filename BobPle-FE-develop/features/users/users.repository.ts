import { apiFetch } from '@/shared/api/client';
import type { UserProfile } from '@/features/auth/auth.repository';

export const getUserProfile = (userId: number) => apiFetch<UserProfile>(`/api/users/${userId}`);
