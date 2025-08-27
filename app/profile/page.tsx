"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Edit, Star, MapPin, Users, LogOut, LogIn } from "lucide-react";
import { authAPI, reviewAPI, eventAPI } from "@/lib/api";

// === 화면용 타입 ===
type Profile = {
  id: number | null;            // 숫자만 허용 (없으면 null)
  name: string;
  avatar?: string | null;
  statusMessage?: string | null;
  location?: string | null;
  rating?: number | null;
  completedMeals?: number | null;
  hostedMeals?: number | null;
  bio?: string | null;
};

type Review = {
  id: number | string;
  reviewerName: string;
  reviewerAvatar?: string | null;
  rating: number;
  createdAt: string; // ISO
  comment: string;
  eventTitle?: string | null;
};

type MyEvent = {
  id: number | string;
  title: string;
  date: string; // ISO (start)
  participants: number; // current participants
  status: "upcoming" | "completed";
};

// === 매퍼(응답 키 흡수) ===
function mapProfile(p: any): Profile {
  // 가능한 모든 id 키를 흡수하고 숫자로 변환
  const rawId =
    p?.id ??
    p?.userId ??
    p?.user_id ??
    p?.user?.id ??
    p?.user?.userId ??
    p?.user?.user_id ??
    null;

  const idNum =
    rawId != null && !Number.isNaN(Number(rawId)) ? Number(rawId) : null;

  return {
    id: idNum,
    name: p?.nickname ?? p?.name ?? "사용자",
    avatar: p?.profile_img ?? p?.avatar ?? p?.avatarUrl ?? null,
    statusMessage: p?.statusMessage ?? p?.status_message ?? null,
    location: p?.location ?? null,
    rating: p?.rating ?? null,
    completedMeals: p?.completedMeals ?? p?.completed_meals ?? null,
    hostedMeals: p?.hostedMeals ?? p?.hosted_meals ?? null,
    bio: p?.bio ?? null,
  };
}

function mapReview(r: any): Review {
  return {
    id: r?.id ?? r?._id ?? String(Math.random()),
    reviewerName:
      r?.reviewerName ??
      r?.reviewer?.nickname ??
      r?.reviewer?.name ??
      r?.fromUser?.nickname ??
      "익명",
    reviewerAvatar:
      r?.reviewerAvatar ?? r?.reviewer?.avatar ?? r?.reviewer?.profile_img ?? null,
    rating: Number(r?.score ?? r?.rating ?? 0),
    createdAt: r?.created_at ?? r?.createdAt ?? new Date().toISOString(),
    comment: r?.comment ?? r?.content ?? "",
    eventTitle: r?.eventTitle ?? r?.event?.title ?? null,
  };
}

function mapMyEvent(e: any): MyEvent {
  const start = e?.start_at ?? e?.date ?? e?.startDateTime ?? new Date().toISOString();
  const end = e?.end_at ?? e?.endDateTime ?? null;
  const endDate = end ? new Date(end) : null;
  const status: "upcoming" | "completed" =
    endDate ? (endDate.getTime() < Date.now() ? "completed" : "upcoming") : "upcoming";

  return {
    id: e?.id ?? e?.eventId ?? String(Math.random()),
    title: e?.title ?? "제목 없음",
    date: typeof start === "string" ? start : new Date().toISOString(),
    participants:
      Number(
        e?.current_participants ?? e?.participants ?? e?.currentParticipants ?? 0
      ) || 0,
    status,
  };
}

// 안전한 배열 추출
function asArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.events)) return data.events;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.success?.lists)) return data.success.lists;
  return [];
}

export default function ProfilePage() {
  const router = useRouter();

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("isLoggedIn") === "true";
  });

  const [profile, setProfile] = useState<Profile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [recentEvents, setRecentEvents] = useState<MyEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // 데이터 로드
  useEffect(() => {
    const load = async () => {
      if (!isLoggedIn) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError("");

      try {
        // 1) 내 프로필
        const pr = await authAPI.getProfile().catch(() => null);
        const rawProfile = (pr as any)?.profile ?? pr;

        // 프로필이 없다 = 세션/토큰 이슈일 가능성 → 에러 배너 노출
        if (!rawProfile) {
          setProfile(null);
          setReviews([]);
          setRecentEvents([]);
          setError("로그인 세션이 유효하지 않거나 프로필을 불러오지 못했습니다.");
          return;
        }

        const mapped = mapProfile(rawProfile);
        setProfile(mapped);

        // 2) 받은 리뷰 — 숫자 id일 때만 호출
        if (typeof mapped.id === "number" && Number.isFinite(mapped.id)) {
          const rr = await reviewAPI.getUserReviews(mapped.id, 1, 10).catch(() => null);
          setReviews(asArray(rr).map(mapReview));
        } else {
          setReviews([]);
        }

        // 3) 내가 참여한/주최한 밥약
        const ev = await eventAPI.getMyEvents().catch(() => null);
        setRecentEvents(asArray(ev).map(mapMyEvent));
      } catch (e: any) {
        setError(e?.message || "프로필 정보를 불러오는 중 오류가 발생했습니다.");
        setProfile(null);
        setReviews([]);
        setRecentEvents([]);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [isLoggedIn]);

  const handleAuthToggle = async () => {
    if (isLoggedIn) {
      try {
        await authAPI.logout();
      } catch {
      } finally {
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("authToken");
        localStorage.removeItem("user");
        setIsLoggedIn(false);
        setProfile(null);
        setReviews([]);
        setRecentEvents([]);
        router.push("/login");
      }
    } else {
      router.push("/login");
    }
  };

  // 로딩 화면
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <img
            src="/bobple-mascot.png"
            alt="밥플 마스코트"
            className="w-16 h-16 mx-auto mb-4 animate-bounce"
          />
          <p className="text-muted-foreground">프로필을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" onClick={() => router.back()}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <h1 className="text-xl font-semibold">내 프로필</h1>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant={isLoggedIn ? "outline" : "default"}
                size="sm"
                onClick={handleAuthToggle}
                className="flex items-center space-x-1"
              >
                {isLoggedIn ? (
                  <>
                    <LogOut className="w-4 h-4" />
                    <span>로그아웃</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>로그인</span>
                  </>
                )}
              </Button>
              {isLoggedIn && (
                <Button variant="outline" size="sm" onClick={() => router.push("/profile/edit")}>
                  <Edit className="w-4 h-4 mr-1" />
                  <span>수정</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {!isLoggedIn ? (
          // 로그인 안됨
          <div className="text-center py-12">
            <img
              src="/bobple-mascot.png"
              alt="밥플 마스코트"
              className="w-32 h-32 mx-auto mb-6 animate-bounce"
            />
            <h2 className="text-2xl font-bold mb-4">로그인이 필요해요!</h2>
            <p className="text-muted-foreground mb-6">밥플에서 새로운 사람들과 맛있는 식사를 함께해보세요</p>
            <Button onClick={handleAuthToggle} size="lg">
              <LogIn className="w-4 h-4 mr-2" />
              로그인하기
            </Button>
          </div>
        ) : profile == null ? (
          // 로그인은 되어있는데 프로필 못 불러옴
          <div className="text-center py-12">
            {error && (
              <div className="mb-6 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md inline-block">
                {error}
              </div>
            )}
            <div className="space-x-2">
              <Button variant="outline" onClick={() => router.refresh()}>다시 시도</Button>
              <Button onClick={() => router.push("/login")}>다시 로그인</Button>
            </div>
          </div>
        ) : (
          // 정상 표시
          <>
            {error && (
              <div className="mb-6 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                {error}
              </div>
            )}

            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row items-center md:items-start space-y-4 md:space-y-0 md:space-x-6">
                  <Avatar className="w-24 h-24">
                    <AvatarImage src={profile.avatar || "/placeholder.svg"} />
                    <AvatarFallback className="text-2xl">
                      {profile.name?.[0] || "U"}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 text-center md:text-left">
                    <h2 className="text-2xl font-bold mb-2">{profile.name}</h2>
                    {profile.statusMessage && (
                      <p className="text-sm text-muted-foreground mb-3 italic">
                        "{profile.statusMessage}"
                      </p>
                    )}
                    <div className="flex items-center justify-center md:justify-start space-x-4 text-sm text-muted-foreground mb-3">
                      <div className="flex items-center">
                        <MapPin className="w-4 h-4 mr-1" />
                        {profile.location || "위치 정보 없음"}
                      </div>
                    </div>

                    <div className="flex items-center justify-center md:justify-start space-x-6 mb-4">
                      <div className="text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <Star className="w-4 h-4 fill-current text-yellow-500" />
                          <span className="font-semibold">{profile.rating ?? 0}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {reviews.length}개 리뷰
                        </span>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold">{profile.completedMeals ?? 0}</div>
                        <span className="text-xs text-muted-foreground">완료한 밥약</span>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold">{profile.hostedMeals ?? 0}</div>
                        <span className="text-xs text-muted-foreground">주최한 밥약</span>
                      </div>
                    </div>

                    <p className="text-muted-foreground leading-relaxed">
                      {profile.bio || "자기소개가 없습니다."}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="events" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="events">참여한 밥약</TabsTrigger>
                <TabsTrigger value="reviews">받은 리뷰</TabsTrigger>
              </TabsList>

              <TabsContent value="events" className="space-y-4">
                {recentEvents.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">참여한 밥약이 없습니다.</p>
                  </div>
                ) : (
                  recentEvents.map((event) => (
                    <Card
                      key={event.id}
                      className={`transition-shadow ${
                        event.status === "upcoming" ? "cursor-pointer hover:shadow-md" : "opacity-75"
                      }`}
                      onClick={() => {
                        if (event.status === "upcoming") router.push(`/events/${event.id}`);
                      }}
                    >
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold mb-1">{event.title}</h3>
                            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                              <span>{new Date(event.date).toLocaleDateString("ko-KR")}</span>
                              <div className="flex items-center">
                                <Users className="w-3 h-3 mr-1" />
                                {event.participants}명 참여
                              </div>
                            </div>
                          </div>
                          <Badge variant={event.status === "completed" ? "secondary" : "default"}>
                            {event.status === "completed" ? "완료" : "예정"}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              <TabsContent value="reviews" className="space-y-4">
                {reviews.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">받은 리뷰가 없습니다.</p>
                  </div>
                ) : (
                  reviews.map((review) => (
                    <Card key={review.id}>
                      <CardContent className="pt-4">
                        <div className="flex items-start space-x-3">
                          <Avatar className="w-10 h-10">
                            <AvatarImage src={review.reviewerAvatar || "/placeholder.svg"} />
                            <AvatarFallback>{review.reviewerName?.[0] || "U"}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <span className="font-medium">{review.reviewerName}</span>
                              <div className="flex items-center">
                                {[...Array(5)].map((_, i) => (
                                  <Star
                                    key={i}
                                    className={`w-3 h-3 ${
                                      i < review.rating ? "fill-current text-yellow-500" : "text-gray-300"
                                    }`}
                                  />
                                ))}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {new Date(review.createdAt).toLocaleDateString("ko-KR")}
                              </span>
                            </div>
                            {review.eventTitle && (
                              <p className="text-xs text-muted-foreground mb-1">{review.eventTitle}</p>
                            )}
                            <p className="text-sm text-muted-foreground">{review.comment}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}
