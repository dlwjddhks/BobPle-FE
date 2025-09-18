"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { apiRequest } from "@/lib/api";
import { putMyProfile } from "@/features/auth/auth.repository";

import { auth, googleProvider } from "@/shared/lib/firebase";
import { signInWithPopup } from "firebase/auth";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [nickname, setNickname] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [grade, setGrade] = useState("");     // "1" | "2" | "3" | "4"
  const [gender, setGender] = useState("");   // "M" | "F" | "N"
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // 응답에서 isCompleted 꺼내는 보조
  const extractCompleted = (obj: any): boolean | null => {
    if (!obj || typeof obj !== "object") return null;
    const v =
      obj.isCompleted ??
      obj.is_completed ??
      obj.user?.isCompleted ??
      obj.user?.is_completed ??
      obj.success?.isCompleted ??
      obj.success?.is_completed ??
      null;
    return typeof v === "boolean" ? v : null;
  };

  // Google 로그인
  const handleLoginWithGoogle = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setErrMsg(null);

    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const idToken = await cred.user.getIdToken(true);

      const res = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ idToken }),
      });

      const token =
        res?.token ?? res?.accessToken ?? res?.access_token ?? res?.jwt ??
        res?.data?.token ?? res?.data?.accessToken ?? null;
      if (token) localStorage.setItem("authToken", token);

      const user = res?.user ?? res?.success ?? null;
      if (user) localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("isLoggedIn", "true");

      let completed = extractCompleted(res);
      if (completed == null) {
        try {
          const refreshed = await apiRequest("/api/auth/refresh", { method: "POST" });
          const u = refreshed?.user ?? refreshed ?? null;
          if (u?.id) localStorage.setItem("user", JSON.stringify(u));
          const fromRefresh = extractCompleted(refreshed);
          if (fromRefresh != null) completed = fromRefresh;
        } catch {}
      }

      if (completed === false) {
        setShowProfileSetup(true);
        return;
      }
      router.replace(next);
    } catch (e: any) {
      setErrMsg(e?.message || "로그인에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // 프로필 설정 저장
  const handleProfileSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProfileLoading) return;

    const nick = nickname.trim();
    if (!grade || !gender || !nick) {
      setErrMsg("학년, 성별, 닉네임은 모두 입력해야 합니다.");
      return;
    }

    const payload = {
      grade: Number(grade),
      gender: gender as "M" | "F" | "N",
      nickname: nick,
    };

    setIsProfileLoading(true);
    setErrMsg(null);

    try {
      await putMyProfile(payload);
      setShowProfileSetup(false);
      router.replace(next);
    } catch (err: any) {
  // 서버에서 내려온 에러 바디 우선 표시
  const msg =
    err?.body?.reason ||
    err?.body?.message ||
    err?.message ||
    "프로필 저장에 실패했습니다.";
  console.error("[profile save failed]", err); // 네트워크 탭과 함께 콘솔로도 확인
  setErrMsg(String(msg));
} finally {
  setIsProfileLoading(false);
}
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img src="/bobple-mascot.png" alt="밥플 마스코트" className="w-20 h-20 animate-bounce" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">밥플</h1>
          <p className="text-muted-foreground">새로운 사람들과 함께하는 식사</p>
        </div>

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

      {/* 프로필 설정 모달 */}
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
                  <SelectItem value="1">1학년</SelectItem>
                  <SelectItem value="2">2학년</SelectItem>
                  <SelectItem value="3">3학년</SelectItem>
                  <SelectItem value="4">4학년</SelectItem>
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
                  <SelectItem value="M">남성</SelectItem>
                  <SelectItem value="F">여성</SelectItem>
                  <SelectItem value="N">선택안함</SelectItem>
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
