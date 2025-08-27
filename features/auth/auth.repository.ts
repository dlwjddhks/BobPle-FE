import { apiFetch } from '@/shared/api/client';
import { authAPI, type Profile } from "@/lib/api";

/** Login */
export function postLogin(payload: { idToken: string }) {
  return apiFetch<{ ok: boolean; token?: string; user?: any; isCompleted?: boolean }>(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}


/** Logout */
export async function postLogout() {
  return apiFetch('/api/auth/logout', { method: 'POST' }); // body 없음
}

/** 타입 */
export type UserProfile = {
  id: number;
  email: string;
  grade: number | null;
  gender: "M" | "F" | "N" | null;
  nickname: string | null;
  isCompleted?: boolean;     // ← camelCase로
  is_completed?: boolean;    // ← snake_case도 대응
};

/** helpers: UI → 서버 스키마 매핑 */
const toWireGender = (g: any): 'M' | 'F' | 'N' | undefined => {
  if (g === '남성' || g === 'M') return 'M';
  if (g === '여성' || g === 'F') return 'F';
  if (g === '상관없음' || g === '무관' || g === 'N') return 'N';
  return undefined;
};
const toWireGrade = (v: any): number | undefined => {
  if (v == null) return undefined;
  const n = typeof v === 'number' ? v : parseInt(String(v).replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
};

/** 내 프로필 조회: refresh → users/{id} */
// 저장(수정)
/** 내 프로필 조회(에러 → null로 흡수) */
export async function getMyProfile(): Promise<Profile | null> {
  const me = await authAPI.getProfile().catch(() => null);
  return me;
}

/** 초기 프로필 저장 */
export async function putMyProfile(payload: {
  grade: number;
  gender: "Male" | "Female" | "None";
  nickname: string;
}) {
  return authAPI.updateProfile(payload);
}
const authRepository = { getMyProfile, putMyProfile };
export default authRepository;