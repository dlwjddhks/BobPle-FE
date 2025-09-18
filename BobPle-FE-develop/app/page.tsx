// app/page.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
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
// 연/월/일 전체 포맷
const toFullDate = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
};
// 지난 이벤트 판별 (endISO 우선, 없으면 startISO 기준)
const isPastEvent = (ev: { startISO?: string | null; endISO?: string | null }) => {
  const now = Date.now();
  const end = ev.endISO ? Date.parse(ev.endISO) : NaN;
  const start = ev.startISO ? Date.parse(ev.startISO) : NaN;
  const ref = !Number.isNaN(end) ? end : start;
  return !Number.isNaN(ref) && ref < now;
};
// 정렬용 기준 시간 (end 우선)
const ts = (ev: { startISO?: string | null; endISO?: string | null }) => {
  const end = ev.endISO ? Date.parse(ev.endISO) : NaN;
  const start = ev.startISO ? Date.parse(ev.startISO) : NaN;
  return !Number.isNaN(end) ? end : (!Number.isNaN(start) ? start : 0);
};

// 서버가 식당 이름을 안 줄 때 임시 폴백
const RESTAURANT_NAME_BY_ID: Record<number, string> = {
  1: "부산 예가네 24가 스토어",
};

// 표시용 최대 인원(서버 값이 없을 때 기본)
const DEFAULT_MAX = 4;

// ✅ users 보강은 끄고 restaurants만 유지
const ENRICH_USERS = false;
const ENRICH_RESTAURANTS = true;
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

  currentParticipants?: number | null;
  maxParticipants?: number | null;

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

    currentParticipants: e?.participantsCount ?? e?.participants_count ?? null,
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
const restCache = new Map<number, string>();

/* ===================== page ===================== */
type ViewMode = "upcoming" | "past";

export default function HomePage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("upcoming"); // ✅ 토글 상태

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

      // ✅ users 호출 제거, restaurants만 시도
      await Promise.allSettled([
        ...(ENRICH_USERS ? userIds.filter(id => !nickCache.has(id)).map(async id => {
          try {
            const u = await apiRequest(`/api/users/${id}`);
            const name = u?.nickname ?? u?.name ?? u?.data?.nickname ?? u?.data?.name ?? null;
            if (name) nickCache.set(id, name);
          } catch {}
        }) : []),
        ...(ENRICH_RESTAURANTS ? restIds.filter(id => !restCache.has(id)).map(async id => {
          try {
            const r = await apiRequest(`/api/restaurants/${id}`);
            const name = r?.name ?? r?.title ?? r?.data?.name ?? r?.data?.title ?? null;
            if (name) restCache.set(id, name);
            else if (RESTAURANT_NAME_BY_ID[id]) restCache.set(id, RESTAURANT_NAME_BY_ID[id]);
          } catch {
            if (RESTAURANT_NAME_BY_ID[id]) restCache.set(id, RESTAURANT_NAME_BY_ID[id]);
          }
        }) : []),
      ]);

      // 최종 병합
      const merged: EventItem[] = base.map(ev => {
        const creatorName =
          (ev.host.name && ev.host.name !== "호스트"
            ? ev.host.name
            : (typeof ev.creatorId === "number" ? nickCache.get(ev.creatorId) : undefined)) ?? "호스트";

        const restaurantName =
          ev.restaurantName ??
          (typeof ev.restaurantId === "number" ? restCache.get(ev.restaurantId) : undefined) ??
          (ev.restaurantId ? `식당 #${ev.restaurantId}` : "장소 미정");

        const displayCount =
          ev.currentParticipants != null
            ? Math.max(1, Number(ev.currentParticipants) + (ev.creatorId ? 1 : 0))
            : 1;

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

      // 프론트 검색
      const qnorm = q.trim().toLowerCase();
      const searched =
        qnorm.length === 0
          ? merged
          : merged.filter(ev => {
              const hay = [ev.title, ev.description ?? "", ev.host.name ?? "", ev.restaurantName ?? ""]
                .join(" ")
                .toLowerCase();
              return hay.includes(qnorm);
            });

      setEvents(searched);

      if (DEBUG_EVENTS) {
        console.log({ base, merged, searched });
      }
    } catch (e: any) {
      console.error("목록 로드 실패:", e);
      setError(e?.message || "밥약 목록을 불러오지 못했습니다.");
      setEvents([]);
    }
  }

  // ✅ 토글/정렬이 적용된 최종 리스트
  const visibleEvents = useMemo(() => {
    const list =
      viewMode === "past"
        ? events.filter(isPastEvent).sort((a, b) => ts(b) - ts(a)) // 지난: 최근 순
        : events.filter(ev => !isPastEvent(ev)).sort((a, b) => ts(a) - ts(b)); // 현재/다가올: 빠른 순
    return list;
  }, [events, viewMode]);

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

      {/* 히어로 + 검색 + 뷰 토글 */}
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
          <div className="flex-1 relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="지역, 음식 종류, 레스토랑 이름으로 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* ✅ 지난/현재 토글 */}
          <div className="flex rounded-md border border-border overflow-hidden">
            <Button
              variant={viewMode === "upcoming" ? "default" : "ghost"}
              className={`rounded-none ${viewMode === "upcoming" ? "" : "bg-transparent"}`}
              onClick={() => setViewMode("upcoming")}
              size="sm"
            >
              현재 밥약 보기
            </Button>
            <Button
              variant={viewMode === "past" ? "default" : "ghost"}
              className={`rounded-none border-l border-border ${viewMode === "past" ? "" : "bg-transparent"}`}
              onClick={() => setViewMode("past")}
              size="sm"
            >
              지난 밥약 보기
            </Button>
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
          {visibleEvents.map((ev) => {
            const sameDay =
              ev.startISO &&
              ev.endISO &&
              new Date(ev.startISO).toDateString() === new Date(ev.endISO).toDateString();

            return (
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
                          {ev.startISO
                            ? `${toFullDate(ev.startISO)} ${ev.startHHMM ?? toHHMM(ev.startISO)}`
                            : "시작 미정"}
                          {" ~ "}
                          {ev.endISO
                            ? `${sameDay ? "" : toFullDate(ev.endISO) + " "}${ev.endHHMM ?? toHHMM(ev.endISO)}`
                            : "종료 미정"}
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
            );
          })}
        </div>

        {visibleEvents.length === 0 && !error && (
          <div className="text-center py-12">
            <img src="/bobple-mascot.png" alt="밥플 마스코트" className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground text-lg">
              {viewMode === "past" ? "지난 밥약이 없습니다." : "현재/다가올 밥약이 없습니다."}
            </p>
            <p className="text-muted-foreground">
              {viewMode === "past" ? "다시 ‘현재 밥약 보기’를 눌러보세요." : "다른 키워드로 검색해보세요."}
            </p>
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
