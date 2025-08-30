// app/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { MapPin, Clock, Users, Plus, MessageCircle, Search } from "lucide-react";
import { eventAPI, apiRequest } from "@/lib/api";

/* ===================== utils ===================== */
const toHHMM = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
};
const toDateLabel = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
};

// 서버가 식당 이름을 안 줄 때 임시 폴백
const RESTAURANT_NAME_BY_ID: Record<number, string> = {
  1: "부산 예가네 24가 스토어",
};

// 표시용 최대 인원(서버 값이 없을 때 기본)
const DEFAULT_MAX = 4;

// 개별 조회 보강할지 여부
const ENRICH_VIA_API = true;
const DEBUG_EVENTS = false;

/* ===================== types ===================== */
type EventHost = {
  id?: number | string;
  name: string;
  avatar?: string | null;
  rating?: number | null;
};
type EventItem = {
  id: number | string;
  title: string;
  description?: string | null;

  startISO?: string | null;
  endISO?: string | null;
  dateLabel?: string | null;
  startHHMM?: string | null;
  endHHMM?: string | null;

  restaurantId?: number | null;
  restaurantName?: string | null;

  currentParticipants?: number | null; // 서버가 주면 사용
  maxParticipants?: number | null;     // 서버가 주면 사용

  creatorId?: number | null;
  host: EventHost;
};

function mapEventFromApi(e: any): EventItem {
  const startISO = e?.startAt ?? e?.start_at ?? e?.startDateTime ?? null;
  const endISO   = e?.endAt   ?? e?.end_at   ?? e?.endDateTime   ?? null;

  const creatorIdRaw =
    e?.creator?.id ?? e?.creator_id ?? e?.creatorId ?? e?.user_id ?? e?.userId ?? null;
  const creatorId =
    typeof creatorIdRaw === "number"
      ? creatorIdRaw
      : Number.isFinite(Number(creatorIdRaw))
      ? Number(creatorIdRaw)
      : null;

  const creatorNickname =
    e?.creator?.nickname ??
    e?.creatorNickname ??
    e?.creator_name ??
    e?.nickname ??
    e?.user?.nickname ??
    e?.writer?.nickname ??
    e?.hostName ??
    e?.ownerName ??
    null;

  const restaurantIdRaw = e?.restaurant?.id ?? e?.restaurant_id ?? e?.restaurantId ?? null;
  const restaurantId =
    typeof restaurantIdRaw === "number"
      ? restaurantIdRaw
      : Number.isFinite(Number(restaurantIdRaw))
      ? Number(restaurantIdRaw)
      : null;

  const restaurantName =
    e?.restaurant?.name ?? e?.restaurant_name ?? e?.restaurantName ?? e?.placeName ?? null;

  return {
    id: e?.id ?? e?.eventId ?? String(Math.random()),
    title: e?.title ?? "제목 없음",
    description: e?.content ?? e?.description ?? null,

    startISO,
    endISO,
    dateLabel: toDateLabel(startISO),
    startHHMM: toHHMM(startISO),
    endHHMM: toHHMM(endISO),

    restaurantId,
    restaurantName,

    // 서버에 참가자 수가 있으면 그대로 사용
    currentParticipants:
      e?.participantsCount ?? e?.participants_count ?? null,
    maxParticipants: e?.maxParticipants ?? e?.max_participants ?? null,

    creatorId,
    host: {
      id: creatorId ?? undefined,
      name: creatorNickname ?? "호스트",
      avatar: e?.creator?.avatar ?? null,
      rating: null,
    },
  };
}

/* ===================== caches ===================== */
const nickCache = new Map<number, string>();
const restCache = new Map<number, string>(); // restaurantId → name

/* ===================== page ===================== */
export default function HomePage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const flag = localStorage.getItem("isLoggedIn") === "true";
    if (flag) {
      setIsLoggedIn(true);
      void loadEvents("");
    } else {
      router.push("/login");
    }
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 검색 디바운스
  useEffect(() => {
    if (!isLoggedIn) return;
    const t = setTimeout(() => void loadEvents(searchTerm), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, isLoggedIn]);

  async function loadEvents(q: string) {
    try {
      setError("");
      const { items } = await eventAPI.getEvents({ search: q, page: 1, size: 20 });

      const base: EventItem[] = (items || []).map(mapEventFromApi);

      // 개별 API 보강(선택)
      const userIds = Array.from(
        new Set(
          (base.map(b => b.creatorId) as Array<number | null | undefined>)
            .filter((v): v is number => typeof v === "number" && Number.isInteger(v) && v > 0)
        )
      );
      const restIds = Array.from(
        new Set(
          (base.map(b => b.restaurantId) as Array<number | null | undefined>)
            .filter((v): v is number => typeof v === "number" && Number.isInteger(v) && v > 0)
        )
      );

      if (ENRICH_VIA_API) {
        await Promise.allSettled([
          ...userIds.filter(id => !nickCache.has(id)).map(async id => {
            try {
              const u = await apiRequest(`/api/users/${id}`);
              const name = u?.nickname ?? u?.name ?? u?.data?.nickname ?? u?.data?.name ?? null;
              if (name) nickCache.set(id, name);
            } catch {}
          }),
          ...restIds.filter(id => !restCache.has(id)).map(async id => {
            try {
              const r = await apiRequest(`/api/restaurants/${id}`);
              const name = r?.name ?? r?.title ?? r?.data?.name ?? r?.data?.title ?? null;
              if (name) restCache.set(id, name);
              else if (RESTAURANT_NAME_BY_ID[id]) restCache.set(id, RESTAURANT_NAME_BY_ID[id]);
            } catch {
              if (RESTAURANT_NAME_BY_ID[id]) restCache.set(id, RESTAURANT_NAME_BY_ID[id]);
            }
          }),
        ]);
      }

      // 최종 병합 + “호스트는 최소 1명” 규칙
      const merged: EventItem[] = base.map(ev => {
        const creatorName =
          (ev.host.name && ev.host.name !== "호스트"
            ? ev.host.name
            : (typeof ev.creatorId === "number" ? nickCache.get(ev.creatorId) : undefined)) ?? "호스트";

        const restaurantName =
          ev.restaurantName ??
          (typeof ev.restaurantId === "number" ? restCache.get(ev.restaurantId) : undefined) ??
          (ev.restaurantId ? `식당 #${ev.restaurantId}` : "장소 미정");

        // 서버가 participantsCount를 안 주면 0으로 보이는데,
        // “호스트는 무조건 참여자” 규칙으로 최소 1명 보장
        const displayCount = Math.max(1, ev.currentParticipants ?? 0);

        return {
          ...ev,
          host: { ...ev.host, name: creatorName },
          restaurantName,
          currentParticipants: displayCount,
          maxParticipants: ev.maxParticipants ?? DEFAULT_MAX,
          dateLabel: ev.dateLabel ?? toDateLabel(ev.startISO),
          startHHMM: ev.startHHMM ?? toHHMM(ev.startISO),
          endHHMM: ev.endHHMM ?? toHHMM(ev.endISO),
        };
      });

      // 프론트 검색(서버 search 미지원 대비)
      const qnorm = q.trim().toLowerCase();
      const finalList =
        qnorm.length === 0
          ? merged
          : merged.filter(ev => {
              const hay = [
                ev.title,
                ev.description ?? "",
                ev.host.name ?? "",
                ev.restaurantName ?? "",
              ].join(" ").toLowerCase();
              return hay.includes(qnorm);
            });

      setEvents(finalList);
    } catch (e: any) {
      console.error("목록 로드 실패:", e);
      setError(e?.message || "밥약 목록을 불러오지 못했습니다.");
      setEvents([]);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <img src="/bobple-mascot.png" alt="밥플 마스코트" className="w-16 h-16 mx-auto mb-4 animate-bounce" />
          <p className="text-muted-foreground">로딩 중...</p>
        </div>
      </div>
    );
  }
  if (!isLoggedIn) return <></>;

  return (
    <div className="min-h-screen bg-background">
      {/* 헤더 */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <img src="/bobple-mascot.png" alt="밥플 마스코트" className="w-8 h-8" />
              <h1 className="text-2xl font-bold text-foreground">밥플</h1>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm" onClick={() => router.push("/chats")}>
                <MessageCircle className="w-4 h-4" />
              </Button>
              <Avatar className="w-8 h-8 cursor-pointer" onClick={() => router.push("/profile")}>
                <AvatarImage src="/placeholder.svg?height=32&width=32" />
                <AvatarFallback>나</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>
      </header>

      {/* 히어로 + 검색 */}
      <section className="bg-gradient-to-br from-primary/10 to-accent/10 py-12">
        <div className="container mx-auto px-4 text-center">
          <div className="flex justify-center mb-6">
            <img src="/bobple-mascot.png" alt="밥플 마스코트" className="w-24 h-24 animate-bounce" />
          </div>
          <h2 className="text-3xl font-bold text-foreground mb-4">새로운 사람들과 함께하는 식사</h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
            혼자 먹기 아쉬운 맛집, 새로운 사람들과 함께 나누어보세요. 밥플에서 특별한 식사 경험을 만들어가세요.
          </p>
          <Button size="lg" className="mr-4" onClick={() => router.push("/create")}>
            <Plus className="w-5 h-5 mr-2" />
            밥약 만들기
          </Button>
          <Button variant="outline" size="lg" onClick={() => router.push("/restaurants")}>
            맛집 찾아보기
          </Button>
        </div>
      </section>

      <section className="container mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="지역, 음식 종류, 레스토랑 이름으로 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </section>

      {/* 목록 */}
      <main className="container mx-auto px-4 pb-8">
        {error && (
          <div className="mb-6 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {events.map((ev) => (
            <Card
              key={String(ev.id)}
              onClick={() => router.push(`/events/${ev.id}`)}
              className="hover:shadow-lg transition-shadow cursor-pointer"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-2">{ev.title}</CardTitle>

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="inline-flex items-center">
                        <MapPin className="w-4 h-4 mr-1" />
                        {ev.restaurantName ?? "장소 미정"}
                      </span>
                      <span className="inline-flex items-center">
                        <Clock className="w-4 h-4 mr-1" />
                        {ev.dateLabel ?? "시간 미정"} {ev.startHHMM ?? "??:??"}
                        {ev.endHHMM ? `-${ev.endHHMM}` : ""}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center text-sm text-muted-foreground">
                    <Users className="w-4 h-4 mr-1" />
                    {ev.currentParticipants ?? 1}/{ev.maxParticipants ?? DEFAULT_MAX}
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {ev.description && (
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{ev.description}</p>
                )}

                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Avatar className="w-6 h-6">
                      <AvatarImage src={ev.host.avatar ?? "/placeholder.svg"} />
                      <AvatarFallback>{ev.host.name?.[0] ?? "H"}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{ev.host.name}</span>
                  </div>

                  {ev.restaurantName && (
                    <Badge variant="outline" className="text-xs">
                      {ev.restaurantName}
                    </Badge>
                  )}
                </div>

                <Button
                  className="w-full"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/events/${ev.id}`);
                  }}
                >
                  참여하기
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {events.length === 0 && !error && (
          <div className="text-center py-12">
            <img src="/bobple-mascot.png" alt="밥플 마스코트" className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground text-lg">검색 결과가 없습니다.</p>
            <p className="text-muted-foreground">다른 키워드로 검색해보세요.</p>
          </div>
        )}
      </main>

      <div className="fixed bottom-6 right-6">
        <Button size="lg" className="rounded-full shadow-lg" onClick={() => router.push("/create")}>
          <Plus className="w-6 h-6" />
        </Button>
      </div>
    </div>
  );
}
