// app/create/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Search } from "lucide-react";
import { eventAPI } from "@/lib/api";

/** 상수 */
const DRAFT_KEY = "createEventDraft_v1";

/** 에러 객체에서 사용자 메시지 뽑기 */
function getErrorMessage(err: any): string {
  if (!err) return "알 수 없는 오류가 발생했습니다.";
  if (typeof err === "string") return err;
  if (err?.error?.reason) return String(err.error.reason);
  if (err?.reason) return String(err.reason);
  if (typeof err?.message === "string" && err.message) return err.message;
  if (typeof err?.detail === "string") return err.detail;
  try { return JSON.stringify(err); } catch { return String(err); }
}

/** 한국시간(+09:00) ISO 변환 */
function toISO(date: string, time: string) {
  return new Date(`${date}T${time}:00+09:00`).toISOString();
}

export default function CreateEventPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 식당 선택 쿼리 (검색 페이지에서 돌아올 때 세팅됨)
  const qpId = searchParams.get("id") ?? searchParams.get("restaurantId") ?? "";
  const qpName = searchParams.get("name") ?? searchParams.get("restaurant") ?? "";
  const qpAddress = searchParams.get("address") ?? searchParams.get("location") ?? "";

  /** ---- 상태 ---- */
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    restaurant: "",
    location: "",
  });
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const loadedRef = useRef(false); // draft 중복 적용 방지

  /** 1) 최초 마운트 시 draft 복원 */
  useEffect(() => {
    if (typeof window === "undefined" || loadedRef.current) return;
    loadedRef.current = true;

    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const d = JSON.parse(saved);
        setFormData({
          title: d.title ?? "",
          content: d.content ?? "",
          restaurant: d.restaurant ?? "",
          location: d.location ?? "",
        });
        setStartDate(d.startDate ?? "");
        setStartTime(d.startTime ?? "");
        setEndDate(d.endDate ?? "");
        setEndTime(d.endTime ?? "");
      }
    } catch {}
  }, []);

  /** 2) 식당 선택 쿼리가 들어오면 기존 draft에 "병합" */
  useEffect(() => {
    if (!qpId && !qpName && !qpAddress) return;
    setFormData((prev) => ({
      ...prev,
      // 사용자가 기존에 적어둔 값은 유지하되, 쿼리가 오면 식당/주소만 갱신
      restaurant: qpName || prev.restaurant,
      location: qpAddress || prev.location,
    }));
  }, [qpId, qpName, qpAddress]);

  /** 3) 변경될 때마다 draft 자동 저장 (300ms 디바운스) */
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            ...formData,
            startDate,
            startTime,
            endDate,
            endTime,
          })
        );
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [formData, startDate, startTime, endDate, endTime]);

  /** 돋보기(식당 검색) 진입 전에 즉시 저장 */
  const goRestaurantSearch = () => {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          ...formData,
          startDate,
          startTime,
          endDate,
          endTime,
        })
      );
    } catch {}
    router.push("/restaurants");
  };

  /** 프리체크: 날짜/시간 */
  function validateDateRange() {
    if (!startDate || !startTime || !endDate || !endTime) {
      return "시작/종료 일시를 모두 선택해주세요.";
    }
    const now = Date.now();
    const start = new Date(`${startDate}T${startTime}:00+09:00`).getTime();
    const end = new Date(`${endDate}T${endTime}:00+09:00`).getTime();

    if (start <= now) return "시작 시간은 현재보다 미래에 가능합니다.";
    if (end <= start) return "종료 시간은 시작 시간 이후여야 합니다.";
    return "";
  }

  // 제출
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const precheck = validateDateRange();
    if (precheck) { setError(precheck); return; }

    const restaurantId = Number(qpId || 0);
    if (!restaurantId) {
      setError("식당 ID가 필요합니다. 식당 상세에서 버튼을 눌러 이동해주세요.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const payload = {
        title: formData.title,
        content: formData.content,
        restaurantId,
        startAt: toISO(startDate, startTime),
        endAt: toISO(endDate, endTime),
      };

      const res: any = await eventAPI.createEvent(payload);

      if (res?.resultType === "FAIL" || res?.success === false || res?.error) {
        setError(getErrorMessage(res));
        return;
      }

      // 성공 → draft 삭제
      try { localStorage.removeItem(DRAFT_KEY); } catch {}

      const newId = res?.id ?? res?.data?.id;
      router.push(newId ? `/events/${newId}` : "/");
    } catch (err: any) {
      console.error("밥약 생성 실패:", err);
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  /** 취소 시에도 draft 정리(선택) */
  const handleCancel = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    router.back();
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
            <CardHeader><CardTitle>기본 정보</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title">제목 *</Label>
                <Input
                  id="title"
                  placeholder="예: 강남역 맛집 탐방"
                  value={formData.title}
                  onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                  required
                />
              </div>

              <div>
                <Label htmlFor="content">설명</Label>
                <Textarea
                  id="content"
                  placeholder="어떤 식사 모임인지 자세히 설명해주세요"
                  value={formData.content}
                  onChange={(e) => setFormData((p) => ({ ...p, content: e.target.value }))}
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
                    onChange={(e) => setFormData((p) => ({ ...p, restaurant: e.target.value }))}
                    className="flex-1"
                  />
                  <Button type="button" variant="outline" onClick={goRestaurantSearch}>
                    <Search className="w-4 h-4" />
                  </Button>
                </div>
                {!Number(qpId || 0) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    * 식당 상세에서 “이 식당에서 밥약 만들기” 버튼을 눌러야 자동 연결됩니다.
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="location">만날 장소 (선택)</Label>
                <Input
                  id="location"
                  placeholder="예: 강남역 2번 출구"
                  value={formData.location}
                  onChange={(e) => setFormData((p) => ({ ...p, location: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* 날짜/시간 */}
          <Card>
            <CardHeader><CardTitle>날짜 및 시간</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startDate">시작 날짜 *</Label>
                  <Input
                    id="startDate" type="date" value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]} required
                  />
                </div>
                <div>
                  <Label htmlFor="startTime">시작 시간 *</Label>
                  <Input
                    id="startTime" type="time" value={startTime}
                    onChange={(e) => setStartTime(e.target.value)} required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="endDate">종료 날짜 *</Label>
                  <Input
                    id="endDate" type="date" value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate || new Date().toISOString().split("T")[0]} required
                  />
                </div>
                <div>
                  <Label htmlFor="endTime">종료 시간 *</Label>
                  <Input
                    id="endTime" type="time" value={endTime}
                    onChange={(e) => setEndTime(e.target.value)} required
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

          {/* 버튼 */}
          <div className="flex gap-4">
            <Button type="button" variant="outline" className="flex-1 bg-transparent" onClick={handleCancel}>
              취소
            </Button>
            <Button
              type="submit" className="flex-1"
              disabled={isSubmitting || !formData.title || !startDate || !startTime || !endDate || !endTime}
            >
              {isSubmitting ? "생성 중..." : "밥약 만들기"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
