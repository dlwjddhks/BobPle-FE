"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Star, MapPin, Calendar, Users, Flag } from "lucide-react";

import { apiRequest } from "@/lib/api";

/* ================= 타입 ================= */
type ProfileHeader = {
  id: number;
  name: string;
  avatar?: string | null;
  location?: string | null;
  joinedAt?: string | null;
  ratingAvg?: number | null;
  reviewCount?: number | null;
  completedMeals?: number | null;
  hostedMeals?: number | null;
};

type Review = {
  id: number | string;
  rating: number;
  createdAt: string;
  comment?: string | null;
};

type ListedEvent = {
  id: number;
  title: string;
  startISO: string | null;
  endISO: string | null;
  participantsCount: number | null;
  creatorId?: number | null;
};

type UiEvent = {
  id: number;
  title: string;
  date: string; // startISO
  participants: number;
  status: "upcoming" | "completed";
  isHost: boolean;
};

/* ================= 유틸 ================= */
const toNum = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const computeStatus = (
  startISO?: string | null,
  endISO?: string | null
): "upcoming" | "completed" => {
  const now = Date.now();
  const end = endISO ? Date.parse(endISO) : NaN;
  const start = startISO ? Date.parse(startISO) : NaN;
  if (!Number.isNaN(end)) return end < now ? "completed" : "upcoming";
  if (!Number.isNaN(start)) return start < now ? "completed" : "upcoming";
  return "upcoming";
};

const asArray = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.events)) return data.events;
  if (Array.isArray(data?.data?.items)) return data.data.items;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.success?.lists)) return data.success.lists;
  return [];
};

/* 목록 row → 최소 필드 맵핑 */
const mapListedEvent = (raw: any): ListedEvent => ({
  id: toNum(raw?.id) ?? Number(Math.random().toString().slice(2)),
  title: raw?.title ?? "제목 없음",
  startISO: raw?.startISO ?? raw?.start_at ?? raw?.startAt ?? null,
  endISO: raw?.endISO ?? raw?.end_at ?? raw?.endAt ?? null,
  participantsCount:
    toNum(raw?.participantsCount) ??
    toNum(raw?.participants_count) ??
    toNum(raw?.currentParticipants) ??
    null,
  creatorId: toNum(raw?.creatorId ?? raw?.creator_id ?? raw?.creator?.id),
});

/* 이벤트 상세에서 참가자 id/everything 읽기 */
async function readParticipantsAndCreator(eventId: number): Promise<{
  participantIds: number[];
  creatorId: number | null;
  raw: any | null;
}> {
  try {
    const d: any = await apiRequest(`/api/events/${encodeURIComponent(String(eventId))}`);
    const detail = d?.data?.item ?? d?.item ?? d;

    const creatorId =
      toNum(detail?.creatorId) ?? toNum(detail?.creator_id) ?? toNum(detail?.creator?.id) ?? null;

    const partList: any[] = Array.isArray(detail?.participants) ? detail.participants : [];
    const participantIds = partList
      .map((p) => toNum(p?.id ?? p?.userId ?? p?.user_id))
      .filter((n): n is number => Number.isFinite(n as number));

    return { participantIds, creatorId, raw: detail ?? d ?? null };
  } catch {
    return { participantIds: [], creatorId: null, raw: null };
  }
}

/* 리뷰 전체 페이지 끌어오기 (take/size 혼용 백엔드 방어) */
async function fetchAllReviewsFor(userId: number, pageSize = 50) {
  const out: Review[] = [];
  let page = 1;

  while (true) {
    let res: any = await apiRequest(
      `/api/reviews/${encodeURIComponent(String(userId))}?page=${page}&take=${pageSize}`
    ).catch(() => null);

    if (!res || (!Array.isArray(res?.items) && !Array.isArray(res?.data?.items))) {
      res = await apiRequest(
        `/api/reviews/${encodeURIComponent(String(userId))}?page=${page}&size=${pageSize}`
      ).catch(() => null);
    }
    const items = asArray(res);
    if (!items.length) break;

    for (const it of items) {
      out.push({
        id: it?.id ?? `${page}-${out.length}`,
        rating: Number(it?.score ?? it?.rating ?? 0),
        createdAt: it?.created_at ?? it?.createdAt ?? new Date().toISOString(),
        comment: it?.comment ?? it?.content ?? null,
      });
    }

    const hasNext =
      typeof res?.pagination?.hasNext === "boolean"
        ? res.pagination.hasNext
        : items.length === pageSize;

    if (!hasNext || items.length < pageSize) break;
    page += 1;
  }

  return out;
}

/* ================= 페이지 ================= */
export default function UserProfilePage() {
  const router = useRouter();
  const params = useParams();
  const profileId = useMemo(() => Number(String((params as any)?.userId ?? "").trim()), [params]);

  const [header, setHeader] = useState<ProfileHeader | null>(null);
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  /* 숫자 → 평균 한 자리 */
  const ratingAvg = useMemo(() => {
    if (!reviews.length) return 0;
    const s = reviews.reduce((a, b) => a + (b.rating || 0), 0);
    return Math.round((s / reviews.length) * 10) / 10;
  }, [reviews]);

  useEffect(() => {
    let canceled = false;

    async function load() {
      try {
        setErr(null);
        setLoading(true);

        if (!Number.isFinite(profileId)) {
          throw new Error("잘못된 사용자 ID입니다.");
        }

        /* 1) 사용자 기본(있으면 사용, 없으면 나중에 이벤트로 닉네임 추정) */
        let displayName: string | null = null;
        let avatar: string | null = null;
        try {
          const u: any = await apiRequest(`/api/users/${encodeURIComponent(String(profileId))}`);
          const user = u?.data?.item ?? u?.item ?? u;
          displayName = user?.nickname ?? user?.name ?? null;
          avatar = user?.profile_img ?? user?.avatar ?? null;
        } catch {
          // users 미구현 or 404 → 이벤트에서 추후 유추
        }

        /* 2) 리뷰 전체 */
        const allReviews = await fetchAllReviewsFor(profileId, 50);
        if (!canceled) setReviews(allReviews);

        /* 3) 최근 밥약 후보(한 번에 50개 정도 가져와서 상세로 필터링) */
        const listRes: any = await apiRequest(`/api/events?page=1&size=50`).catch(() => null);
        const rows = asArray(listRes).map(mapListedEvent);

        const uiList: UiEvent[] = [];
        let fallbackName: string | null = null;
        let completed = 0;
        let hosted = 0;

        // 상세를 보면서 “내가 주최/참여한 것만” 추림
        for (const row of rows) {
          if (!row?.id) continue;
          const { participantIds, creatorId, raw } = await readParticipantsAndCreator(row.id);

          const isHost = Number(creatorId) === Number(profileId);
          const isParticipant = participantIds.includes(Number(profileId));
          if (!isHost && !isParticipant) continue;

          // 이름 없으면 이벤트에서 추정
          if (!displayName) {
            if (isHost) {
              fallbackName =
                raw?.creator?.nickname ??
                raw?.creator?.name ??
                fallbackName ??
                null;
            } else {
              const hit =
                (Array.isArray(raw?.participants) ? raw.participants : []).find(
                  (p: any) => Number(p?.id ?? p?.userId ?? p?.user_id) === Number(profileId)
                ) ?? null;
              fallbackName = hit?.nickname ?? hit?.name ?? fallbackName ?? null;
            }
          }

          const participantsCount =
            toNum(raw?.participants_count) ??
            toNum(raw?.participantsCount) ??
            (Array.isArray(raw?.participants) ? raw.participants.length : null) ??
            row.participantsCount ??
            0;

          const status = computeStatus(
            row.startISO ?? raw?.startISO ?? raw?.start_at ?? raw?.startAt,
            row.endISO ?? raw?.endISO ?? raw?.end_at ?? raw?.endAt
          );

          uiList.push({
            id: row.id,
            title: row.title,
            date:
              row.startISO ??
              raw?.startISO ??
              raw?.start_at ??
              raw?.startAt ??
              new Date().toISOString(),
            participants: participantsCount ?? 0,
            status,
            isHost,
          });

          if (status === "completed") completed += 1;
          if (isHost) hosted += 1;
        }

        // 정렬 (최신 우선)
        uiList.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

        // 헤더 세팅
        const baseHeader: ProfileHeader = {
          id: profileId,
          name: displayName ?? fallbackName ?? `이름 없음 (ID: ${profileId})`,
          avatar: avatar ?? null,
          location: "-",
          joinedAt: null,
          ratingAvg,
          reviewCount: allReviews.length,
          completedMeals: completed,
          hostedMeals: hosted,
        };

        if (!canceled) {
          setHeader(baseHeader);
          setEvents(uiList);
        }
      } catch (e: any) {
        if (!canceled) {
          setErr(e?.message || "프로필을 불러오지 못했습니다.");
          setHeader({
            id: Number.isFinite(profileId) ? profileId : 0,
            name: `이름 없음 (ID: ${Number.isFinite(profileId) ? profileId : "?"})`,
          } as any);
          setEvents([]);
          setReviews([]);
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    }

    load();
    return () => {
      canceled = true;
    };
  }, [profileId, ratingAvg]);

  const joinedLabel = useMemo(() => {
    if (!header?.joinedAt) return "-";
    try {
      return (
        new Date(header.joinedAt).toLocaleDateString("ko-KR", {
          year: "numeric",
          month: "long",
        }) + " 가입"
      );
    } catch {
      return "-";
    }
  }, [header?.joinedAt]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" onClick={() => router.back()}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <h1 className="text-xl font-semibold">{header?.name ?? "프로필"}</h1>
            </div>
            <Button variant="ghost" size="sm" title="신고">
              <Flag className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* 오류 */}
        {err && (
          <div className="mb-4 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
            {err}
          </div>
        )}

        {/* 프로필 카드 */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center md:items-start space-y-4 md:space-y-0 md:space-x-6">
              <Avatar className="w-24 h-24">
                <AvatarImage src={header?.avatar || "/placeholder.svg"} />
                <AvatarFallback className="text-2xl">
                  {(header?.name ?? "U")[0]}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 text-center md:text-left">
                <h2 className="text-2xl font-bold mb-2">{header?.name ?? "이름 없음"}</h2>

                <div className="flex items-center justify-center md:justify-start space-x-4 text-sm text-muted-foreground mb-3">
                  <div className="flex items-center">
                    <MapPin className="w-4 h-4 mr-1" />
                    {header?.location ?? "-"}
                  </div>
                  <div className="flex items-center">
                    <Calendar className="w-4 h-4 mr-1" />
                    {joinedLabel}
                  </div>
                </div>

                <div className="flex items-center justify-center md:justify-start space-x-6 mb-4">
                  <div className="text-center">
                    <div className="flex items-center justify-center space-x-1">
                      <Star className="w-4 h-4 fill-current text-yellow-500" />
                      <span className="font-semibold">{ratingAvg.toFixed(1)}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {reviews.length}개 리뷰
                    </span>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold">{header?.completedMeals ?? 0}</div>
                    <span className="text-xs text-muted-foreground">완료한 밥약</span>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold">{header?.hostedMeals ?? 0}</div>
                    <span className="text-xs text-muted-foreground">주최한 밥약</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 최근 밥약 / 받은 리뷰 */}
        <Tabs defaultValue="events" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="events">최근 밥약</TabsTrigger>
            <TabsTrigger value="reviews">받은 리뷰</TabsTrigger>
          </TabsList>

          {/* 최근 밥약 */}
          <TabsContent value="events" className="space-y-4">
            {events.length === 0 ? (
              <div className="text-sm text-muted-foreground">최근 밥약이 없습니다.</div>
            ) : (
              events.map((ev) => (
                <Card
                  key={ev.id}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => router.push(`/events/${ev.id}`)}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold mb-1">{ev.title}</h3>
                          {ev.isHost && (
                            <Badge variant="outline" className="text-xs">
                              주최
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                          <span>{new Date(ev.date).toLocaleDateString("ko-KR")}</span>
                          <div className="flex items-center">
                            <Users className="w-3 h-3 mr-1" />
                            {ev.participants}명 참여
                          </div>
                        </div>
                      </div>
                      <Badge variant={ev.status === "completed" ? "secondary" : "default"}>
                        {ev.status === "completed" ? "완료" : "예정"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* 받은 리뷰 */}
          <TabsContent value="reviews" className="space-y-4">
            {reviews.length === 0 ? (
              <div className="text-sm text-muted-foreground">받은 리뷰가 없습니다.</div>
            ) : (
              reviews.map((rv) => (
                <Card key={rv.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start space-x-3">
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={"/placeholder.svg"} />
                        <AvatarFallback>익</AvatarFallback>
                      </Avatar>

                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium">익명</span>
                          <div className="flex items-center">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`w-3 h-3 ${
                                  i < (rv.rating || 0)
                                    ? "fill-current text-yellow-500"
                                    : "text-gray-300"
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(rv.createdAt).toLocaleDateString("ko-KR")}
                          </span>
                        </div>

                        {rv.comment && (
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {rv.comment}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
