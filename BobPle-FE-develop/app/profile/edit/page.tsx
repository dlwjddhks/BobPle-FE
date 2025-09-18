"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Camera } from "lucide-react";

import { authAPI } from "@/lib/api";

/* ──────────────── 유틸: UI ↔ 서버 매핑 ──────────────── */
const toWireGender = (g: string | null): "Male" | "Female" | "None" | null => {
  if (!g) return null;
  if (g === "남성" || g === "Male" || g === "M") return "Male";
  if (g === "여성" || g === "Female" || g === "F") return "Female";
  return "None";
};

const toUiGender = (g?: string | null): "남성" | "여성" | "선택안함" => {
  if (!g) return "선택안함";
  const v = g.toLowerCase();
  if (v === "male" || v === "m") return "남성";
  if (v === "female" || v === "f") return "여성";
  return "선택안함";
};

const toWireGrade = (display: string | number | null): number | null => {
  if (display == null) return null;
  if (typeof display === "number") return Number.isFinite(display) ? display : null;
  const s = String(display);
  if (s.includes("대학원")) return 5;
  if (s.includes("졸업")) return 6;
  const m = s.match(/^(\d)/);
  return m ? Number(m[1]) : null;
};

const toUiGrade = (n?: number | null): string => {
  if (n == null || !Number.isFinite(n)) return "";
  if (n === 5) return "대학원생";
  if (n === 6) return "졸업생";
  return `${n}학년`;
};

export default function EditProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    nickname: "",
    gradeDisplay: "",
    genderDisplay: "",
    email: "",
    bio: "",
    statusMessage: "",
    location: "",
    avatar: "/placeholder.svg?height=120&width=120",
  });

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        setErr(null);
        const pr = await authAPI.getProfile().catch(() => null);
        const p = (pr as any)?.profile ?? pr;
        const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
        const user = userStr ? JSON.parse(userStr) : null;

        if (!canceled && p) {
          setFormData((prev) => ({
            ...prev,
            nickname: p?.nickname ?? p?.name ?? prev.nickname,
            gradeDisplay: toUiGrade(p?.grade ?? null),
            genderDisplay: toUiGender(p?.gender ?? null),
            email: user?.email ?? p?.email ?? prev.email,
            bio: p?.bio ?? prev.bio,
            statusMessage: p?.statusMessage ?? p?.status_message ?? prev.statusMessage,
            location: p?.location ?? prev.location,
            avatar: p?.profile_img ?? p?.avatar ?? prev.avatar,
          }));
        }
      } catch (e: any) {
        if (!canceled) setErr(e?.message || "프로필을 불러오는 중 오류가 발생했습니다.");
      }
    })();
    return () => { canceled = true; };
  }, []);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFormData((prev) => ({ ...prev, avatar: (event.target?.result as string) || prev.avatar }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const grade = toWireGrade(formData.gradeDisplay);
    const gender = toWireGender(formData.genderDisplay);
    const nickname = formData.nickname?.trim() || "";

    if (grade == null || !gender || !nickname) {
      setErr("학년/성별/닉네임을 모두 입력해주세요.");
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(true);
    setErr(null);
    setOk(null);

    try {
      await authAPI.updateProfile({ grade, gender, nickname });
      setOk("프로필이 저장되었습니다.");
      router.push("/profile");
    } catch (error: any) {
      setErr(error?.message || "프로필 저장에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-xl font-semibold">프로필 수정</h1>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-2xl">
        {err && <div className="mb-4 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">{err}</div>}
        {ok && <div className="mb-4 p-3 text-sm text-green-600 bg-green-100/40 border border-green-200 rounded-md">{ok}</div>}

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader><CardTitle>프로필 사진</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center space-x-4">
                <Avatar className="w-20 h-20">
                  <AvatarImage src={formData.avatar || "/placeholder.svg"} />
                  <AvatarFallback className="text-xl">{(formData.nickname || "U")[0]}</AvatarFallback>
                </Avatar>
                <div className="space-y-2">
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                  <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                    <Camera className="w-4 h-4 mr-2" /> 사진 변경
                  </Button>
                  <p className="text-xs text-muted-foreground">JPG, PNG 파일만 업로드 가능 (현재 저장은 미지원)</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>기본 정보</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="nickname">닉네임 *</Label>
                <Input id="nickname" value={formData.nickname} onChange={(e) => setFormData((prev) => ({ ...prev, nickname: e.target.value }))} required />
              </div>

              <div>
                <Label htmlFor="email">이메일</Label>
                <Input id="email" type="email" value={formData.email} readOnly />
                <p className="text-xs text-muted-foreground mt-1">이메일은 여기서 변경하지 않습니다.</p>
              </div>

              <div>
                <Label htmlFor="gender">성별 *</Label>
                <Select value={formData.genderDisplay} onValueChange={(value) => setFormData((prev) => ({ ...prev, genderDisplay: value }))}>
                  <SelectTrigger><SelectValue placeholder="성별을 선택하세요" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="남성">남성</SelectItem>
                    <SelectItem value="여성">여성</SelectItem>
                    <SelectItem value="선택안함">선택안함</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="grade">학년 *</Label>
                <Select value={formData.gradeDisplay} onValueChange={(value) => setFormData((prev) => ({ ...prev, gradeDisplay: value }))}>
                  <SelectTrigger><SelectValue placeholder="학년을 선택하세요" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1학년">1학년</SelectItem>
                    <SelectItem value="2학년">2학년</SelectItem>
                    <SelectItem value="3학년">3학년</SelectItem>
                    <SelectItem value="4학년">4학년</SelectItem>
                    <SelectItem value="대학원생">대학원생</SelectItem>
                    <SelectItem value="졸업생">졸업생</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="statusMessage">상태메시지</Label>
                <Input id="statusMessage" value={formData.statusMessage} onChange={(e) => setFormData((prev) => ({ ...prev, statusMessage: e.target.value }))} maxLength={50} />
                <p className="text-xs text-muted-foreground mt-1">{formData.statusMessage.length}/50자</p>
              </div>

              <div>
                <Label htmlFor="location">지역</Label>
                <Input id="location" value={formData.location} onChange={(e) => setFormData((prev) => ({ ...prev, location: e.target.value }))} />
              </div>

              <div>
                <Label htmlFor="bio">자기소개</Label>
                <Textarea id="bio" value={formData.bio} onChange={(e) => setFormData((prev) => ({ ...prev, bio: e.target.value }))} rows={4} />
              </div>

              <p className="text-xs text-muted-foreground">
                저장 시 현재는 <strong>닉네임/성별/학년</strong>만 서버에 반영됩니다. (나머지는 백엔드 지원 시 연동)
              </p>
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button type="button" variant="outline" className="flex-1 bg-transparent" onClick={() => router.back()}>취소</Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting || !formData.nickname || !formData.genderDisplay || !formData.gradeDisplay}>
              {isSubmitting ? "저장 중..." : "저장하기"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
