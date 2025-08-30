// app/profile/[userId]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Star, MapPin, Calendar, Users, Flag } from "lucide-react";

import { apiRequest, userAPI, reviewAPI } from "@/lib/api";

// ── 화면용 타입 ──────────────────────────────────────────────
type UserProfile = {
  id: number | string;
  name: string;
  avatar?: string | null;
  bio?: string | null;
  location?: string | null;
  joinDate?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  completedMeals?: number | null;
  hostedMeals?: number | null;
};

type RecentEvent = {
  id: number | string;
  title: string;
  date: string;
  status: "upcoming" | "completed";
  participants?: number | null;
};

type ReceivedReview = {
  id: number | string;
  reviewer: { name: string; avatar?: string | null };
  rating: number;
  comment?: string | null;
  date: string;
};

// ── 매핑 헬퍼 ───────────────────────────────────────────────
function mapUserFromApi(raw: any): UserProfile {
  return {
    id: raw?.id ?? raw?._id ?? "user",
    name: raw?.nickname ?? raw?.name ?? "이름 없음",
    avatar: raw?.profile_img ?? raw?.avatar ?? null,
    bio: raw?.bio ?? null,
    location: raw?.location ?? null,
    joinDate: raw?.created_at ?? raw?.createdAt ?? null,
    rating: raw?.rating ?? null,
    reviewCount: raw?.reviewCount ?? raw?.reviews_count ?? null,
    completedMeals: raw?.completedMeals ?? raw?.completed_meals ?? null,
    hostedMeals: raw?.hostedMeals ?? raw?.hosted_meals ?? null,
  };
}
function mapEventFromApi(raw: any): RecentEvent {
  const dt = raw?.start_at ?? raw?.date ?? raw?.created_at ?? new Date().toISOString();
  const done = Boolean(raw?.is_completed ?? raw?.completed);
  return {
    id: raw?.id ?? raw?._id ?? Math.random().toString(36).slice(2),
    title: raw?.title ?? raw?.name ?? "제목 없음",
    date: typeof dt === "string" ? dt : new Date().toISOString(),
    status: done ? "completed" : "upcoming",
    participants: raw?.current_participants ?? raw?.participants ?? null,
  };
}
function mapReviewFromApi(raw: any): ReceivedReview {
  const dt = raw?.created_at ?? raw?.date ?? new Date().toISOString();
  const reviewerName =
    raw?.reviewer?.nickname ?? raw?.reviewer?.name ?? raw?.fromUser?.nickname ?? "익명";
  const reviewerAvatar = raw?.reviewer?.avatar ?? raw?.reviewer?.profile_img ?? raw?.fromUser?.avatar ?? null;
  return {
    id: raw?.id ?? raw?._id ?? Math.random().toString(36).slice(2),
    reviewer: { name: reviewerName, avatar: reviewerAvatar },
    rating: Number(raw?.score ?? raw?.rating ?? 0),
    comment: raw?.comment ?? raw?.content ?? null,
    date: typeof dt === "string" ? dt : new Date().toISOString(),
  };
}

function asArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.events)) return data.events;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.success?.lists)) return data.success.lists;
  return [];
}

// ── 페이지 ─────────────────────────────────────────────────
export default function UserProfilePage() {
  const router = useRouter();
  const params = useParams();
  const uid = String(params?.userId ?? "").trim();

  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [reviews, setReviews] = useState<ReceivedReview[]>([]);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        setErr(null);
        setLoading(true);

        // ① 사용자 기본 정보
        const user = await userAPI.getUserProfile(Number(uid)).catch(() => null);
        const mapped = user ? mapUserFromApi(user) : null;
        if (!canceled) setProfile(mapped);

        // ② 최근 밥약 (userId 파라미터 직접 쿼리)
        const evRes = await apiRequest(
          `/api/events?userId=${encodeURIComponent(uid)}&page=1&limit=10`
        ).catch(() => null);
        if (!canceled) setRecentEvents(asArray(evRes).slice(0, 5).map(mapEventFromApi));

        // ③ 받은 리뷰
        const userReviews = await reviewAPI.getUserReviews(Number(uid), 1, 10).catch(() => ({ data: [] }));
        if (!canceled) setReviews(asArray(userReviews).slice(0, 5).map(mapReviewFromApi));
      } catch (e: any) {
        if (!canceled) setErr(e?.message || "프로필을 불러오지 못했습니다.");
      } finally {
        if (!canceled) setLoading(false);
      }
    })();
    return () => { canceled = true; };
  }, [uid]);

  const joined = useMemo(() => {
    if (!profile?.joinDate) return "-";
    try {
      return new Date(profile.joinDate).toLocaleDateString("ko-KR", { year: "numeric", month: "long" }) + " 가입";
    } catch { return "-"; }
  }, [profile?.joinDate]);

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
              <h1 className="text-xl font-semibold">
                {profile?.name ?? "프로필"}
              </h1>
            </div>
            <Button variant="ghost" size="sm" title="신고">
              <Flag className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <Card className="mb-6">
          <CardContent className="pt-6">
            {/* 에러 배너 */}
            {err && (
              <div className="mb-4 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                {err}
              </div>
            )}

            <div className="flex flex-col md:flex-row items-center md:items-start space-y-4 md:space-y-0 md:space-x-6">
              <Avatar className="w-24 h-24">
                <AvatarImage src={profile?.avatar || "/placeholder.svg"} />
                <AvatarFallback className="text-2xl">
                  {(profile?.name ?? "N")[0]}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 text-center md:text-left">
                <h2 className="text-2xl font-bold mb-2">{profile?.name ?? "이름 없음"}</h2>

                <div className="flex items-center justify-center md:justify-start space-x-4 text-sm text-muted-foreground mb-3">
                  <div className="flex items-center">
                    <MapPin className="w-4 h-4 mr-1" />
                    {profile?.location ?? "-"}
                  </div>
                  <div className="flex items-center">
                    <Calendar className="w-4 h-4 mr-1" />
                    {joined}
                  </div>
                </div>

                <div className="flex items-center justify-center md:justify-start space-x-6 mb-4">
                  <div className="text-center">
                    <div className="flex items-center justify-center space-x-1">
                      <Star className="w-4 h-4 fill-current text-yellow-500" />
                      <span className="font-semibold">{profile?.rating ?? "-"}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {(profile?.reviewCount ?? reviews.length)}개 리뷰
                    </span>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold">{profile?.completedMeals ?? 0}</div>
                    <span className="text-xs text-muted-foreground">완료한 밥약</span>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold">{profile?.hostedMeals ?? 0}</div>
                    <span className="text-xs text-muted-foreground">주최한 밥약</span>
                  </div>
                </div>

                {profile?.bio && (
                  <p className="text-muted-foreground leading-relaxed mb-2">{profile.bio}</p>
                )}
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

          <TabsContent value="events" className="space-y-4">
            {recentEvents.length === 0 ? (
              <div className="text-sm text-muted-foreground">최근 밥약이 없습니다.</div>
            ) : (
              recentEvents.map((ev) => (
                <Card key={ev.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold mb-1">{ev.title}</h3>
                        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                          <span>{new Date(ev.date).toLocaleDateString("ko-KR")}</span>
                          {ev.participants != null && (
                            <div className="flex items-center">
                              <Users className="w-3 h-3 mr-1" />
                              {ev.participants}명 참여
                            </div>
                          )}
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

          <TabsContent value="reviews" className="space-y-4">
            {reviews.length === 0 ? (
              <div className="text-sm text-muted-foreground">받은 리뷰가 없습니다.</div>
            ) : (
              reviews.map((rv) => (
                <Card key={rv.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start space-x-3">
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={rv.reviewer.avatar || "/placeholder.svg"} />
                        <AvatarFallback>{rv.reviewer.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="font-medium">{rv.reviewer.name}</span>
                          <div className="flex items-center">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`w-3 h-3 ${i < (rv.rating || 0) ? "fill-current text-yellow-500" : "text-gray-300"}`}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(rv.date).toLocaleDateString("ko-KR")}
                          </span>
                        </div>
                        {rv.comment && <p className="text-sm text-muted-foreground">{rv.comment}</p>}
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
