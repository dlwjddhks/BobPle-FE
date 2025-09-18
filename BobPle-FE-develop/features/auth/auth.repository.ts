import { apiRequest, authAPI, type Profile } from "@/lib/api";

/** Login */
export function postLogin(payload: { idToken: string }) {
  return apiRequest<{ ok: boolean; token?: string; user?: any; isCompleted?: boolean }>(
    "/api/auth/login",
    { method: "POST", body: JSON.stringify(payload) }
  );
}

/** Logout */
export async function postLogout() {
  return apiRequest("/api/auth/logout", { method: "POST" });
}

/** 타입 */
export type UserProfile = {
  id: number;
  email: string;
  grade: number | null;
  gender: "M" | "F" | "N" | null;
  nickname: string | null;
  isCompleted?: boolean;
  is_completed?: boolean;
};

/** helpers: UI → 서버 스키마 매핑 */
const toWireGender = (g: any): "M" | "F" | "N" | undefined => {
  if (g === "남성" || g === "Male" || g === "M") return "M";
  if (g === "여성" || g === "Female" || g === "F") return "F";
  if (g === "선택안함" || g === "상관없음" || g === "무관" || g === "None" || g === "N") return "N";
  return undefined;
};
const toWireGrade = (v: any): number | undefined => {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
};

/** 내 프로필 조회(에러 → null로 흡수) */
export async function getMyProfile(): Promise<Profile | null> {
  const me = await authAPI.getProfile().catch(() => null);
  return me;
}

/** 초기/수정 프로필 저장 */
export async function putMyProfile(payload: {
  grade: number | string;
  gender: "남성" | "여성" | "선택안함" | "Male" | "Female" | "None" | "M" | "F" | "N";
  nickname: string;
}) {
  // 1) 값 정규화
  const grade =
    typeof payload.grade === "number"
      ? payload.grade
      : parseInt(String(payload.grade).replace(/\D/g, ""), 10);

  const g = String(payload.gender).replace(/\s/g, "");
  // 두 계열 모두 준비
  const genderLong: "Male" | "Female" | "None" =
    /^남|^M(ale)?$/i.test(g) ? "Male" :
    /^여|^F(emale)?$/i.test(g) ? "Female" : "None";

  const genderShort: "M" | "F" | "N" =
    genderLong === "Male" ? "M" : genderLong === "Female" ? "F" : "N";

  const nickname = String(payload.nickname || "").trim();

  if (!Number.isFinite(grade) || !nickname) {
    throw new Error("학년, 성별, 닉네임은 모두 입력해야 합니다.");
  }

  // 2) 바디 후보(둘 다 시도)
  const bodies = [
    { grade: Number(grade), gender: genderLong,  nickname }, // Male/Female/None
    { grade: Number(grade), gender: genderShort, nickname }, // M/F/N
  ];

  // 3) 경로 후보 (슬래시 유/무 둘 다)
  const urls = ["/api/auth/profile/", "/api/auth/profile"];

  let lastErr: any = null;
  for (const url of urls) {
    for (const body of bodies) {
      try {
        const res = await apiRequest(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        // 성공 시 최신 사용자 응답이 오면 로컬 유저 갱신
        const updated = (res as any)?.data ?? res;
        const userObj = updated?.user ?? updated?.success ?? updated;
        if (userObj?.id) {
          try { localStorage.setItem("user", JSON.stringify(userObj)); } catch {}
        }
        return res;
      } catch (e: any) {
        // 디버깅 로그
        console.error("[putMyProfile] failed", {
          url,
          body,
          status: e?.status,
          message: e?.message,
          payload: e?.body,
        });
        lastErr = e;
        // 다음 조합 계속 시도
      }
    }
  }
  throw lastErr ?? new Error("프로필 저장에 실패했습니다.");
}

const authRepository = { getMyProfile, putMyProfile };
export default authRepository;
