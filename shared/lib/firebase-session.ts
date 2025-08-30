// shared/lib/firebase-session.ts
import { auth } from "./firebase";

// Firebase 로그인 성공 이후 호출
export async function exchangeIdTokenForSession(apiBase: string) {
  const user = auth.currentUser;
  if (!user) throw new Error("No Firebase user");

  // Firebase ID Token
  const idToken = await user.getIdToken(/* forceRefresh */ true);

  // 너희 백엔드가 이 토큰을 검증하고 세션쿠키를 심어줘야 함
  const res = await fetch(`${apiBase.replace(/\/$/, "")}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),  // ★ 명세서가 idToken 받는 형태라고 했지?
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Login session exchange failed (${res.status})`);
  }
}