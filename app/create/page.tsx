// app/create/page.tsx
"use client";

import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { eventAPI } from "@/lib/api";

// 성별 제한 옵션 (UI 전용)
const genderOptions = [
  { value: "all", label: "상관없음" },
  { value: "female", label: "여자만" },
  { value: "male", label: "남자만" },
];

export default function CreateEventPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 폼 상태 (UI 전용 필드 포함)
  const [formData, setFormData] = useState({
    title: "",
    content: "", // ✅ 서버에는 content로 보냄
    restaurant: searchParams.get("restaurant") || "", // UI 표시용(서버 미전송)
    location: searchParams.get("location") || "", // UI 표시용(서버 미전송)
    maxParticipants: 2, // UI 전용
    genderRestriction: "all", // UI 전용
  });

  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 한국시간(+09:00) ISO로 변환
  function toISO(date: string, time: string) {
    return new Date(`${date}T${time}:00+09:00`).toISOString();
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !startTime || !endDate || !endTime) {
      setError("시작/종료 일시를 모두 선택해주세요.");
      return;
    }

    // ✅ 반드시 숫자 restaurantId가 필요(스키마상 NOT NULL)
    const restaurantId = Number(searchParams.get("restaurantId") || 0);
    if (!restaurantId) {
      setError("식당을 먼저 선택해주세요. (돋보기 아이콘으로 식당을 선택)");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      // ✅ 백엔드 스키마에 맞는 페이로드 (camelCase)
      const payload = {
        title: formData.title,
        content: formData.content,
        restaurantId,                       // Int (DB의 restaurant_id와 매핑)
        startAt: toISO(startDate, startTime),
        endAt:   toISO(endDate, endTime),
      };

      const response = await eventAPI.createEvent(payload);

      // 응답 형태가 다양할 수 있으니, 에러만 아니면 성공 처리
      if (!response || response.error) {
        throw new Error(response?.message || "생성 실패");
      }

      router.push("/");
    } catch (err: any) {
      console.error("밥약 생성 실패:", err);
      setError(err?.message || "밥약 생성에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => router.push("/")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-xl font-semibold">밥약 만들기</h1>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
              {error}
            </div>
          )}

          {/* 기본 정보 */}
          <Card>
            <CardHeader>
              <CardTitle>기본 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title">제목 *</Label>
                <Input
                  id="title"
                  placeholder="예: 강남역 맛집 탐방"
                  value={formData.title}
                  onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                  required
                />
              </div>

              <div>
                <Label htmlFor="content">설명</Label>
                <Textarea
                  id="content"
                  placeholder="어떤 식사 모임인지 자세히 설명해주세요"
                  value={formData.content}
                  onChange={(e) => setFormData((prev) => ({ ...prev, content: e.target.value }))}
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="restaurant">레스토랑/카페 이름</Label>
                <div className="flex gap-2">
                  <Input
                    id="restaurant"
                    placeholder="예: 라 트라토리아"
                    value={formData.restaurant}
                    onChange={(e) => setFormData((prev) => ({ ...prev, restaurant: e.target.value }))}
                    className="flex-1"
                  />
                  <Button type="button" variant="outline" onClick={() => router.push("/restaurants")}>
                    <Search className="w-4 h-4" />
                  </Button>
                </div>
                {/* 선택된 restaurantId가 없으면 안내 */}
                {!Number(searchParams.get("restaurantId") || 0) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    * 식당 카드를 눌러 들어간 뒤, “이 식당에서 밥약 만들기” 버튼을 누르면 식당이 연결돼요.
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="location">만날 장소 (선택)</Label>
                <Input
                  id="location"
                  placeholder="예: 강남역 2번 출구"
                  value={formData.location}
                  onChange={(e) => setFormData((prev) => ({ ...prev, location: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  * 참고용 표시만 합니다. 저장은 되지 않아요(백엔드 컬럼 없음).
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 날짜/시간 */}
          <Card>
            <CardHeader>
              <CardTitle>날짜 및 시간</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startDate">시작 날짜 *</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="startTime">시작 시간 *</Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="endDate">종료 날짜 *</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate || new Date().toISOString().split("T")[0]}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="endTime">종료 시간 *</Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              {startDate && startTime && endDate && endTime && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">선택된 일정</p>
                  <p className="font-medium">
                    {startDate} {startTime} - {endDate} {endTime}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 참여자 설정 (UI 전용) */}
          <Card>
            <CardHeader>
              <CardTitle>참여자 설정</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="maxParticipants">최대 참여자 수</Label>
                <Select
                  value={formData.maxParticipants.toString()}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, maxParticipants: Number.parseInt(value) }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2, 3, 4].map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        {num}명
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">* 현재 백엔드 저장은 되지 않습니다.</p>
              </div>

              <div>
                <Label htmlFor="genderRestriction">성별 제한</Label>
                <Select
                  value={formData.genderRestriction}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, genderRestriction: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {genderOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">* 현재 백엔드 저장은 되지 않습니다.</p>
              </div>
            </CardContent>
          </Card>

          {/* 버튼 */}
          <div className="flex gap-4">
            <Button type="button" variant="outline" className="flex-1 bg-transparent" onClick={() => router.back()}>
              취소
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={
                isSubmitting ||
                !formData.title ||
                !startDate ||
                !startTime ||
                !endDate ||
                !endTime
              } // 🔁 location은 필수 아님
            >
              {isSubmitting ? "생성 중..." : "밥약 만들기"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
