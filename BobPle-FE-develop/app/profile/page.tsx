// app/profile/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Star, Users, Flag } from "lucide-react";
import { apiRequest } from "@/lib/api";

/* ========= Types ========= */
type Review = {
  id: number | string;
  rating: number;
  date: string;
  comment?: string | null;
};

type UiEvent = {
  id: number | string;
  title: string;
  date: string;            // startAt
  end?: string | null;     // endAt
  participants: number;
  status: "upcoming" | "completed";
  isHost: boolean;
};

type MeLite = { id: number; name: string; avatar?: string | null };

/* ========= Utils ========= */
const FALLBACK_NAME = "이름 없음";

const asArray = (d: any): any[] =>
  Array.isArray(d) ? d
  : Array.isArray(d?.items) ? d.items
  : Array.isArray(d?.success?.items) ? d.success.items
  : Array.isArray(d?.data?.items) ? d.data.items
  : Array.isArray(d?.data) ? d.data
  : [];

const toNum = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// end가 있으면 end 기준, 없으면 start가 현재 이전이면 완료로 취급
const computeStatus = (start?: string | null, end?: string | null): "upcoming" | "completed" => {
  const now = Date.now();
  const e = end ? Date.parse(end) : NaN;
  const s = start ? Date.parse(start) : NaN;
  if (Number.isFinite(e)) return e < now ? "completed" : "upcoming";
  if (Number.isFinite(s)) return s < now ? "completed" : "upcoming";
  return "upcoming";
};

export default function MyProfilePage() {
  const router = useRouter();

  const [me, setMe] = useState<MeLite | null>(null);
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const ratingAvg = useMemo(() => {
    if (!reviews.length) return 0;
    const s = reviews.reduce((a, b) => a + (b.rating || 0), 0);
    return Math.round((s / reviews.length) * 10) / 10;
  }, [reviews]);

  const completedCount = useMemo(
    () => events.filter((e) => e.status === "completed").length,
    [events]
  );
  const hostedCount = useMemo(() => events.filter((e) => e.isHost).length, [events]);

  useEffect(() => {
    let canceled = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // 내 정보: 로컬 저장소(프로젝트 컨벤션 유지)
        let myId: number | null = null;
        let myName: string | null = null;
        let myAvatar: string | null = null;
        try {
          const raw = localStorage.getItem("user");
          const ls = raw ? JSON.parse(raw) : null;
          myId = toNum(ls?.id);
          myName = ls?.nickname ?? ls?.name ?? null;
          myAvatar = ls?.avatar ?? null;
        } catch {}
        if (!Number.isFinite(myId as number)) throw new Error("로그인 정보가 없습니다.");

        /* ──────────────── ① 내가 신청/주최한 밥약: /events/me ────────────────
           응답 예시(스크린샷):
           success.items[].{
             id, eventId, creatorId, createdAt,
             events: { id, creatorId, title, content, restaurantId, startAt, endAt, ... },
             users: { id, nickname }
           }
        */
        const res = await apiRequest(`/api/events/me?page=1&size=50`);
        const rows = asArray(res);

        const ev: UiEvent[] = rows.map((row: any) => {
          const evObj = row?.events ?? {};
          const start = evObj.startAt ?? evObj.start_at ?? null;
          const end = evObj.endAt ?? evObj.end_at ?? null;

          // 참여자 수는 백엔드 필드가 없을 수 있어 임시 보강:
          const participants =
            toNum(evObj.participantsCount) ??
            toNum(evObj.currentParticipants) ??
            toNum(row?.participantsCount) ??
            1; // 최소 1명

          const creatorId =
            toNum(evObj.creatorId) ?? toNum(evObj.creator_id) ?? null;

          return {
            id: evObj.id ?? row?.eventId ?? row?.id ?? Math.random().toString(36).slice(2),
            title: evObj.title ?? "제목 없음",
            date: typeof start === "string" ? start : new Date().toISOString(),
            end,
            participants: participants ?? 1,
            status: computeStatus(start, end),
            isHost: Number(creatorId) === Number(myId),
          } as UiEvent;
        });

        /* ──────────────── ② 내가 받은 리뷰 (기존 로직 유지) ──────────────── */
        const rv: Review[] = [];
        for (let page = 1; page <= 10; page++) {
          let r: any = await apiRequest(`/api/reviews/${myId}?page=${page}&size=50`).catch(() => null);
          const items = asArray(r);
          if (!items.length) break;
          for (const it of items) {
            rv.push({
              id: it.id ?? `${page}-${rv.length}`,
              rating: Number(it.score ?? it.rating ?? 0),
              date: it.createdAt ?? it.created_at ?? new Date().toISOString(),
              comment: it.comment ?? it.content ?? null,
            });
          }
          const take = Number(r?.pagination?.size ?? 50);
          if (items.length < take) break;
        }

        if (!canceled) {
          setMe({
            id: myId as number,
            name: myName ?? `${FALLBACK_NAME} (ID: ${myId})`,
            avatar: myAvatar ?? null,
          });
          setEvents(ev.sort((a, b) => Date.parse(b.date) - Date.parse(a.date)));
          setReviews(rv.sort((a, b) => Date.parse(b.date) - Date.parse(a.date)));
        }
      } catch (e: any) {
        if (!canceled) {
          setErr(e?.message || "프로필을 불러오지 못했습니다.");
          setMe(null);
          setEvents([]);
          setReviews([]);
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    })();

    return () => { canceled = true; };
  }, []);

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
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => router.back()}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <h1 className="text-xl font-semibold">{me?.name ?? "내 프로필"}</h1>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => router.push("/profile/edit")}>
                프로필 수정
              </Button>
              <Button variant="ghost" size="sm" title="신고">
                <Flag className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {err && (
          <div className="mb-4 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
            {err}
          </div>
        )}

        {/* 프로필 카드 */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
              <Avatar className="w-24 h-24">
                <AvatarImage src={me?.avatar || "/placeholder.svg"} />
                <AvatarFallback className="text-2xl">{(me?.name ?? "U")[0]}</AvatarFallback>
              </Avatar>

              <div className="flex-1 text-center md:text-left">
                <h2 className="text-2xl font-bold mb-2">{me?.name ?? FALLBACK_NAME}</h2>

                <div className="flex items-center justify-center md:justify-start gap-6 mb-4">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Star className="w-4 h-4 fill-current text-yellow-500" />
                      <span className="font-semibold">{ratingAvg}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{reviews.length}개 리뷰</span>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold">{completedCount}</div>
                    <span className="text-xs text-muted-foreground">완료한 밥약</span>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold">{hostedCount}</div>
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
                        <h3 className="font-semibold mb-1">
                          {ev.title}
                          {ev.isHost && <Badge variant="outline" className="ml-2">주최</Badge>}
                        </h3>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{new Date(ev.date).toLocaleDateString("ko-KR")}</span>
                          <div className="flex items-center">
                            <Users className="w-3 h-3 mr-1" />
                            {ev.participants}명 참여
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant={ev.status === "completed" ? "secondary" : "default"}>
                          {ev.status === "completed" ? "완료" : "예정"}
                        </Badge>

                        {/* 완료된 밥약이면 "리뷰 작성" 버튼 */}
                        {ev.status === "completed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/reviews/write?eventId=${ev.id}`);
                            }}
                          >
                            리뷰 작성
                          </Button>
                        )}
                      </div>
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
                    <div className="flex items-start gap-3">
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={"/placeholder.svg"} />
                        <AvatarFallback>익</AvatarFallback>
                      </Avatar>

                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">익명</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(rv.date).toLocaleDateString("ko-KR")}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 mb-2">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3 h-3 ${
                                i < rv.rating ? "fill-current text-yellow-500" : "text-gray-300"
                              }`}
                            />
                          ))}
                        </div>

                        {rv.comment && (
                          <p className="text-sm text-muted-foreground">{rv.comment}</p>
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
