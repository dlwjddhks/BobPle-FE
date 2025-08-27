// app/(auth)/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { apiRequest } from "@/lib/api";              // ✅ authAPI 제거
import { putMyProfile } from "@/features/auth/auth.repository"; // ✅ getMyProfile 제거

import { auth, googleProvider } from "@/shared/lib/firebase";
import { signInWithPopup } from "firebase/auth";

// ---- helpers ------------------------------------------------
function mapGenderToServer(g: string): "Male" | "Female" | "None" | null {
  switch (g) {
    case "남성": return "Male";
    case "여성": return "Female";
    case "선택안함": return "None";
    default: return null;
  }
}
function mapGradeToNumber(gr: string): number | null {
  const m = gr.match(/^(\d)/);
  return m ? Number(m[1]) : null;
}

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [nickname, setNickname] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [grade, setGrade] = useState("");
  const [gender, setGender] = useState("");
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Google 로그인 → idToken → 백엔드 세션 교환 (쿠키로 인증)
  const handleLoginWithGoogle = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setErrMsg(null);

    try {
      // 1) Firebase → idToken
      const cred = await signInWithPopup(auth, googleProvider);
      const idToken = await cred.user.getIdToken(true);

      // 2) 백엔드 세션 교환
      const res = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ idToken }),
      });
      console.log("[/api/auth/login response]", res);

      // (선택) 바디에 토큰/유저가 오면 로컬 백업
      const token =
        res?.token ||
        res?.accessToken ||
        res?.access_token ||
        res?.jwt ||
        res?.data?.token ||
        res?.data?.accessToken ||
        null;
      if (token) localStorage.setItem("authToken", token);

      const user = res?.user ?? res?.success ?? null;
      if (user) localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("isLoggedIn", "true");
console.log("[로그인 성공] user:", user);
console.log("[로컬 저장된 user]:", JSON.parse(localStorage.getItem("user") || "null"));
      // ❗ 프로필 조회/refresh 없이 바로 이동
      router.replace(next);

      // (선택) 서버가 isCompleted=false를 내려주는 경우에만 초기설정 모달을 쓰고 싶다면 아래 주석을 참고
      // if (res?.isCompleted === false) {
      //   setShowProfileSetup(true);
      //   return;
      // }
      // router.replace(next);
    } catch (e: any) {
      setErrMsg(e?.message || "로그인에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // 초기 프로필 설정 저장 (모달을 쓸 때만 사용)
  const handleProfileSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProfileLoading) return;

    const gradeNum = mapGradeToNumber(grade);
    const genderCode = mapGenderToServer(gender);
    const nick = nickname.trim();

    if (gradeNum == null || genderCode == null || !nick) {
      setErrMsg("학년/성별/닉네임을 모두 입력해주세요.");
      return;
    }

    setIsProfileLoading(true);
    setErrMsg(null);

    try {
      const payload = { grade: gradeNum, gender: genderCode, nickname: nick };
      await putMyProfile(payload);
      setShowProfileSetup(false);
      router.replace(next);
    } catch (err: any) {
      setErrMsg(err?.message || "프로필 저장에 실패했습니다.");
    } finally {
      setIsProfileLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 로고/타이틀 */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img src="/bobple-mascot.png" alt="밥플 마스코트" className="w-20 h-20 animate-bounce" />
          </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">밥플</h1>
            <p className="text-muted-foreground">새로운 사람들과 함께하는 식사</p>
        </div>

        {/* 로그인 카드 */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-center text-xl">로그인</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {errMsg && <p className="text-sm text-red-500">{errMsg}</p>}
              <Button
                type="button"
                className="w-full"
                variant="default"
                onClick={handleLoginWithGoogle}
                disabled={isLoading}
              >
                {isLoading ? "로그인 중..." : "Google로 계속하기"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground">
            로그인하면 밥플의 서비스 약관 및 개인정보 처리방침에 동의하게 됩니다.
          </p>
        </div>
      </div>

      {/* (선택) 프로필 초기 설정 모달 — 지금은 기본적으로 안 열리게 되어 있음 */}
      <Dialog open={showProfileSetup} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">프로필 설정</DialogTitle>
            <p className="text-center text-sm text-muted-foreground mt-2">
              밥플 이용을 위해 기본 정보를 입력해주세요
            </p>
          </DialogHeader>

          <form onSubmit={handleProfileSetup} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>학년</Label>
              <Select value={grade} onValueChange={setGrade}>
                <SelectTrigger>
                  <SelectValue placeholder="학년을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1학년">1학년</SelectItem>
                  <SelectItem value="2학년">2학년</SelectItem>
                  <SelectItem value="3학년">3학년</SelectItem>
                  <SelectItem value="4학년">4학년</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>성별</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger>
                  <SelectValue placeholder="성별을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="남성">남성</SelectItem>
                  <SelectItem value="여성">여성</SelectItem>
                  <SelectItem value="선택안함">선택안함</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>닉네임</Label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="닉네임을 입력하세요"
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>

            {errMsg && <p className="text-sm text-red-500">{errMsg}</p>}

            <Button type="submit" className="w-full mt-6" disabled={isProfileLoading}>
              {isProfileLoading ? "설정 중..." : "완료"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
