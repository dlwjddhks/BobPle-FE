"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { eventAPI } from "@/lib/api";
import { eventAPI_mutation, EditEventDto } from "@/lib/api.routes";
import { restaurantsRepository } from "@/features/restaurants/restaurants.repository";

/* datetime-local ↔ ISO 변환 */
const toLocalInput = (iso?: string) => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(
      d.getMinutes()
    )}`;
  } catch {
    return String(iso).slice(0, 16);
  }
};
const toIso = (local: string) => (local ? new Date(local).toISOString() : "");

/** id로 이름/주소 보강 */
async function enrichRestaurant(rid: number) {
  try {
    const r = await restaurantsRepository.getRestaurant(rid);
    return {
      id: Number(r.id ?? rid),
      name: r.name ?? `식당 #${rid}`,
      address: r.address ?? null,
    };
  } catch {
    return { id: rid, name: `식당 #${rid}`, address: null as string | null };
  }
}

export default function EditEventPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const rawId = (params as any)?.id ?? (params as any)?.eventId;
  const eventId = useMemo(
    () => (typeof rawId === "string" && rawId.trim() !== "" ? rawId : null),
    [rawId]
  );

  // ✅ 선택에서 넘어온 값들
  const selectedRestaurantId = useMemo(() => {
    const v = searchParams?.get("restaurantId");
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  }, [searchParams]);
  const selectedRestaurantName = searchParams?.get("restaurantName") || "";
  const selectedRestaurantAddr = searchParams?.get("restaurantAddr") || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // 폼 상태
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  // 식당
  const [restaurantId, setRestaurantId] = useState<number | null>(null);
  const [restaurantName, setRestaurantName] = useState("");

  // 덮어쓰기 방지 락 (선택 이후 상세 재로딩 방지)
  const lockRef = useRef(false);

  /** 상세 로드 */
  useEffect(() => {
    (async () => {
      if (!eventId) {
        setError("유효하지 않은 이벤트 ID 입니다.");
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError("");

        const row: any = await eventAPI.getEvent(String(eventId));

        setTitle(row?.title ?? "");
        setContent(row?.content ?? "");
        setStartAt(toLocalInput(row?.start_at ?? row?.startISO));
        setEndAt(toLocalInput(row?.end_at ?? row?.endISO));

        const ridRaw = row?.restaurant_id ?? row?.restaurantId ?? null;
        const rid = Number(ridRaw);

        // 아직 사용자가 선택으로 락을 걸지 않았다면 상세 응답으로 초기화
        if (!lockRef.current) {
          if (Number.isFinite(rid)) {
            setRestaurantId(rid);
            const info = await enrichRestaurant(rid);
            setRestaurantName(info.name + (info.address ? ` / ${info.address}` : ""));
          } else {
            setRestaurantId(null);
            setRestaurantName("");
          }
        }
      } catch (e: any) {
        setError(e?.message || "이벤트 정보를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    })();

    // 새 이벤트에 들어왔을 때 락 해제
    lockRef.current = false;
  }, [eventId]);

  /** 선택 모드에서 복귀한 경우: 쿼리의 name/addr 즉시 반영 → 필요시 API로 보강 + 락 */
  useEffect(() => {
    (async () => {
      if (selectedRestaurantId == null) return;

      lockRef.current = true; // 상세가 덮어쓰지 못하도록

      setRestaurantId(selectedRestaurantId);

      // 1) 쿼리로 받은 이름/주소가 있으면 즉시 보여주기(UX)
      if (selectedRestaurantName) {
        setRestaurantName(
          selectedRestaurantAddr
            ? `${selectedRestaurantName} / ${selectedRestaurantAddr}`
            : selectedRestaurantName
        );
      }

      // 2) 안전하게 서버에서 다시 보강(쿼리가 없거나 값이 틀릴 수도 있으니)
      const info = await enrichRestaurant(selectedRestaurantId);
      setRestaurantName(info.name + (info.address ? ` / ${info.address}` : ""));

      // 3) 쿼리스트링 제거(새로고침시 중복 적용 방지)
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("restaurantId");
        url.searchParams.delete("restaurantName");
        url.searchParams.delete("restaurantAddr");
        window.history.replaceState({}, "", url.toString());
      }
    })();
  }, [selectedRestaurantId, selectedRestaurantName, selectedRestaurantAddr]);

  /** 저장 */
  async function handleSave() {
    if (!eventId) return;

    try {
      setSaving(true);

      if (restaurantId == null || !Number.isFinite(restaurantId)) {
        alert("식당을 선택해 주세요.");
        return;
      }

      const dto: EditEventDto = {
        title: title.trim(),
        content: content.trim(),
        start_at: toIso(startAt),
        end_at: toIso(endAt),
        restaurant_id: Number(restaurantId),
      };

      await eventAPI_mutation.updateEvent(Number(eventId), dto);
      alert("이벤트가 수정되었습니다.");
      router.push(`/events/${eventId}`);
    } catch (e: any) {
      alert(e?.message || "수정에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  /** 식당 검색(선택 모드)으로 이동 */
  function openRestaurantSearch() {
    if (!eventId) return;
    const returnUrl = `/events/${eventId}/edit`;
    router.push(`/restaurants?mode=select&return=${encodeURIComponent(returnUrl)}`);
  }

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">불러오는 중...</div>;
  }
  if (error) {
    return <div className="min-h-screen grid place-items-center text-destructive">{error}</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>이벤트 수정</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">제목</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div>
              <Label htmlFor="content">내용</Label>
              <Textarea id="content" rows={4} value={content} onChange={(e) => setContent(e.target.value)} />
            </div>

            <div>
              <Label htmlFor="startAt">시작 시간</Label>
              <Input id="startAt" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </div>

            <div>
              <Label htmlFor="endAt">종료 시간</Label>
              <Input id="endAt" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </div>

            {/* 식당: 검색 페이지로 이동해서 선택 → 복귀 */}
            <div>
              <Label>식당</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="식당 이름/주소로 검색 (검색 버튼을 눌러 이동)"
                  value={restaurantName}
                  onChange={() => {}}
                  readOnly
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={openRestaurantSearch}>
                  검색
                </Button>
              </div>

              <div className="text-sm text-muted-foreground mt-2">
                선택됨: {restaurantName ? `${restaurantName} (ID: ${restaurantId ?? "-"})` : "없음"}
              </div>
            </div>

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? "저장 중..." : "저장"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
