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

/* ================= 유틸 ================= */
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

/** (옵션) 식당 임시 매핑 */
const RESTAURANT_NAME_BY_ID: Record<number, string> = {
  1: "부산 예가네 24가 스토어",
};

/** 404 폭탄 막고 싶으면 false 로 두세요 (지금 BE에 /api/users/:id, /api/restaurants/:id 없으면 404 나옴) */
const ENRICH_VIA_API = false;

/* ================= 타입 ================= */
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

  // 시간
  startISO?: string | null;
  endISO?: string | null;
  dateLabel?: string | null;
  startHHMM?: string | null;
  endHHMM?: string | null;

  // 장소(식당)
  restaurantId?: number | null;
  restaurantName?: string | null;

  // 인원
  currentParticipants?: number | null;
  maxParticipants?: number | null;

  // 호스트
  creatorId?: number | null;
  host: EventHost;
};

/** 원본 이벤트 → 화면용 1차 매핑 (닉네임/ID 경로 보강 + 디버그 로그) */
function mapEventFromApi(e: any): EventItem {
  const startISO = e?.start_at ?? e?.startAt ?? e?.startDateTime ?? null;
  const endISO   = e?.end_at   ?? e?.endAt   ?? e?.endDateTime   ?? null;

  // 다양한 키 후보에서 creatorId 추출
  const creatorId =
    e?.creator?.id ??
    e?.creator_id ??
    e?.creatorId ??
    e?.user_id ??
    e?.userId ??
    null;

  // 다양한 키 후보에서 닉네임 추출
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

  // 식당 이름 후보
  const restaurantName =
    e?.restaurant?.name ??
    e?.restaurantName ??
    e?.placeName ??
    null;

  // ---- 디버그: 원본 1건 요약 출력
  // (목록마다 너무 길면 아래 groupCollapsed만 유지해도 OK)
  console.debug("[events:list] raw item =", e);

  return {
    id: e?.id ?? e?.eventId ?? String(Math.random()),
    title: e?.title ?? "제목 없음",
    description: e?.content ?? e?.description ?? null,

    startISO,
    endISO,
    dateLabel: toDateLabel(startISO),
    startHHMM: toHHMM(startISO),
    endHHMM: toHHMM(endISO),

    restaurantId: e?.restaurant_id ?? e?.restaurantId ?? null,
    restaurantName,

    currentParticipants:
      e?.participants_count ??
      e?.participantsCount ??
      (Array.isArray(e?.participants) ? e.participants.length : null),
    maxParticipants: e?.max_participants ?? e?.maxParticipants ?? null,

    creatorId,
    host: {
      id: creatorId ?? undefined,
      name: creatorNickname ?? "호스트", // ← 응답에 닉네임이 있으면 여기서 바로 씀
      avatar: e?.creator?.avatar ?? e?.host?.avatar ?? null,
      rating: e?.host?.rating ?? null,
    },
  };
}

/* ================= 캐시 ================= */
const nickCache = new Map<number, string>();
const restCache = new Map<number, string>();

/* ================= 페이지 ================= */
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

      // ===== 디버그: 원본 목록 요약 출력 =====
      console.groupCollapsed("%c[events:list] server raw items", "color:#888");
      console.table((items ?? []).map((x: any) => ({
        id: x?.id,
        title: x?.title,
        creatorId: x?.creator?.id ?? x?.creator_id ?? x?.creatorId ?? x?.user_id ?? x?.userId,
        nickname:
          x?.creator?.nickname ??
          x?.creatorNickname ??
          x?.creator_name ??
          x?.nickname ??
          x?.user?.nickname ??
          x?.writer?.nickname ??
          x?.hostName ??
          x?.ownerName,
        restaurantId: x?.restaurant_id ?? x?.restaurantId,
        restaurantName: x?.restaurant?.name ?? x?.restaurantName ?? x?.placeName,
        startAt: x?.start_at ?? x?.startAt ?? x?.startDateTime,
        endAt:   x?.end_at   ?? x?.endAt   ?? x?.endDateTime,
      })));
      console.groupEnd();

      // 1) 1차 매핑
      const base: EventItem[] = (items || []).map(mapEventFromApi);

      // ===== 디버그: 1차 매핑 결과 요약 =====
      console.groupCollapsed("%c[events:list] mapped (step1)", "color:#06f");
      console.table(base.map((x) => ({
        id: x.id,
        title: x.title,
        creatorId: x.creatorId,
        hostName: x.host.name,
        restaurantId: x.restaurantId,
        restaurantName: x.restaurantName,
        startISO: x.startISO,
        endISO: x.endISO,
      })));
      console.groupEnd();

      // 2) (옵션) 보강용 id 수집
      const userIds = Array.from(
        new Set(base.map((b) => Number(b.creatorId)).filter((id) => Number.isFinite(id)))
      ) as number[];
      const restIds = Array.from(
        new Set(base.map((b) => Number(b.restaurantId)).filter((id) => Number.isFinite(id)))
      ) as number[];

      if (ENRICH_VIA_API) {
        // 3) (옵션) 병렬 조회
        await Promise.allSettled([
          // 사용자 닉네임
          ...userIds
            .filter((id) => !nickCache.has(id))
            .map(async (id) => {
              try {
                const u = await apiRequest(`/api/users/${id}`);
                const name = u?.nickname ?? u?.name ?? u?.data?.nickname ?? u?.data?.name ?? null;
                if (name) nickCache.set(id, name);
              } catch {}
            }),

          // 식당 이름
          ...restIds
            .filter((id) => !restCache.has(id))
            .map(async (id) => {
              try {
                const r = await apiRequest(`/api/restaurants/${id}`);
                const name = r?.name ?? r?.title ?? r?.data?.name ?? r?.data?.title ?? null;
                if (name) {
                  restCache.set(id, name);
                } else if (RESTAURANT_NAME_BY_ID[id]) {
                  restCache.set(id, RESTAURANT_NAME_BY_ID[id]);
                }
              } catch {
                if (RESTAURANT_NAME_BY_ID[id]) restCache.set(id, RESTAURANT_NAME_BY_ID[id]);
              }
            }),
        ]);
      }

      // 4) 최종 병합
      const withLabels: EventItem[] = base.map((ev) => {
        const creatorName =
          ev.host.name && ev.host.name !== "호스트"
            ? ev.host.name
            : (Number.isFinite(Number(ev.creatorId)) ? nickCache.get(Number(ev.creatorId!)) : null) ?? "호스트";

        const restaurantName =
          ev.restaurantName ??
          (Number.isFinite(Number(ev.restaurantId)) ? restCache.get(Number(ev.restaurantId!)) : undefined) ??
          (ev.restaurantId ? `식당 #${ev.restaurantId}` : null);

        return {
          ...ev,
          host: { ...ev.host, name: creatorName },
          restaurantName,
          dateLabel: ev.dateLabel ?? toDateLabel(ev.startISO),
          startHHMM: ev.startHHMM ?? toHHMM(ev.startISO),
          endHHMM: ev.endHHMM ?? toHHMM(ev.endISO),
        };
      });

      // ===== 디버그: 최종 결과 요약 =====
      console.groupCollapsed("%c[events:list] final (render)", "color:#0a0");
      console.table(withLabels.map((x) => ({
        id: x.id,
        title: x.title,
        hostName: x.host.name,
        restaurantName: x.restaurantName,
        time: `${x.dateLabel ?? ""} ${x.startHHMM ?? ""}${x.endHHMM ? "-" + x.endHHMM : ""}`,
      })));
      console.groupEnd();

      setEvents(withLabels);
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
                    {ev.currentParticipants ?? 0}/{ev.maxParticipants ?? "-"}
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {ev.description && (
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{ev.description}</p>
                )}

                <div className="flex items-center justify-between">
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
