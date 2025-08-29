// app/events/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapPin, Clock, Users, Trash2 } from "lucide-react";
import { eventAPI, apiRequest } from "@/lib/api";

/* ===== 상수 ===== */
const DEFAULT_MAX = 4;

/* ===== 타입 ===== */
type Participant = { id?: number | string; nickname?: string; name?: string; avatar?: string | null };
type CommentItem = {
  id: number | string;
  user: { id?: number | string; name: string; avatar?: string | null };
  content: string;
  createdAt: string;
};
type EventDetail = {
  id: number | string;
  title: string;
  description: string | null;
  restaurantId?: number | null;
  startISO?: string | null;
  endISO?: string | null;
  startHHMM?: string | null;
  endHHMM?: string | null;
  location: string | null;
  currentParticipants?: number | null;
  maxParticipants?: number | null;
  host?: { id?: number | string; name?: string; avatar?: string | null };
  participants: Participant[];
};

/* ===== 유틸 ===== */
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
  return d.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** 식당 조회: 1) /restaurants/:id → 2) /restaurants?q=:id (둘 다 실패 시 null) */
async function fetchRestaurantById(
  restaurantId: number
): Promise<{ name?: string | null; address?: string | null }> {
  try {
    const r = await apiRequest(`/api/restaurants/${restaurantId}`);
    const d = r?.data ?? r;
    if (d) {
      return {
        name: d.name ?? d.restaurantName ?? null,
        address: d.address ?? d.roadAddress ?? null,
      };
    }
  } catch {}
  try {
    const r = await apiRequest(`/api/restaurants?q=${encodeURIComponent(String(restaurantId))}`);
    const d = r?.data ?? r;
    const list: any[] = Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : [];
    const hit = list.find((x) => Number(x.id) === Number(restaurantId));
    if (hit) {
      return {
        name: hit.name ?? hit.restaurantName ?? null,
        address: hit.address ?? hit.roadAddress ?? null,
      };
    }
  } catch {}
  return { name: null, address: null };
}

export default function EventDetailPage() {
  const router = useRouter();
  const params = useParams();
  const eventId = useMemo(() => {
    const v = (params as any)?.eventId ?? (params as any)?.id;
    return typeof v === "string" && v.trim() !== "" ? v : null;
  }, [params]);

  const [detail, setDetail] = useState<EventDetail>({
    id: eventId ?? "",
    title: "제목 없음",
    description: null,
    restaurantId: null,
    startISO: null,
    endISO: null,
    startHHMM: null,
    endHHMM: null,
    location: null,
    currentParticipants: null,
    maxParticipants: null,
    host: undefined,
    participants: [],
  });
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);
  const [error, setError] = useState<string>("");
  const [showApplyDialog, setShowApplyDialog] = useState(false);

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

        const row: any = await eventAPI.getEvent(eventId as string);
        if (!row) throw new Error("이벤트를 찾을 수 없습니다.");

        const startHHMM = toHHMM(row.startISO);
        const endHHMM = toHHMM(row.endISO);

        // 장소/주소 보강
        let location: string | null = row.restaurantAddress ?? row.restaurantName ?? null;
        if (!location && row.restaurantId) {
          const r = await fetchRestaurantById(Number(row.restaurantId));
          location = r.address ?? r.name ?? `식당 #${row.restaurantId}`;
        }

        // 참가자 목록 매핑
        const participants: Participant[] = Array.isArray(row.participants)
          ? row.participants.map((p: any) => ({
              id: p.id,
              nickname: p.nickname,
              name: p.nickname,
              avatar: p.avatar ?? null,
            }))
          : [];

        // 호스트 객체
        const host = {
          id: row.creatorId ?? undefined,
          name: row.creatorNickname ?? "호스트",
          avatar: null,
        };

        // 호스트를 참가자에 합치기(중복 방지)
        const hasHost =
          host.id != null &&
          participants.some((p) => String(p.id ?? "") === String(host.id ?? ""));
        const mergedParticipants = hasHost
          ? participants
          : [{ id: host.id, name: host.name, avatar: host.avatar }, ...participants];

        // 표시용 현재 인원(서버 값이 있으면 사용, 없으면 merged 길이, 최소 1)
        const displayCount =
          row.participantsCount ??
          Math.max(1, mergedParticipants.length);

        const mapped: EventDetail = {
          id: row.id,
          title: row.title ?? "제목 없음",
          description: row.content ?? null,
          restaurantId: row.restaurantId ?? null,
          startISO: row.startISO ?? null,
          endISO: row.endISO ?? null,
          startHHMM,
          endHHMM,
          location,
          currentParticipants: displayCount,
          maxParticipants: row.maxParticipants ?? DEFAULT_MAX,
          host,
          participants: mergedParticipants,
        };

        setDetail(mapped);
        await reloadComments(String(mapped.id));
      } catch (e: any) {
        console.error("[event:detail] load failed:", e);
        setError(e?.message || "상세를 불러오지 못했습니다.");
        setComments([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId]);

  const dateLabel = useMemo(() => toDateLabel(detail.startISO), [detail.startISO]);

  // ===== 댓글 (수정 X) =====
  async function reloadComments(idForComments: string) {
    try {
      const r: any = await apiRequest(`/api/events/${encodeURIComponent(idForComments)}/comments`);
      const rawList: any[] = Array.isArray(r?.items) ? r.items : Array.isArray(r) ? r : [];
      const mapped: CommentItem[] = rawList.map((c: any) => ({
        id: c.id,
        user: {
          id: c.users?.id ?? c.user?.id ?? c.creator?.id ?? undefined,
          name:
            c.users?.nickname ?? c.user?.nickname ?? c.user?.name ?? c.creator?.nickname ?? "사용자",
          avatar: c.users?.avatar ?? c.user?.avatar ?? null,
        },
        content: c.content ?? "",
        createdAt: c.created_at ?? c.createdAt ?? new Date().toISOString(),
      }));
      setComments(mapped);
    } catch (e) {
      console.error("[comments] load failed:", e);
      setComments([]);
    }
  }

  async function createComment() {
    if (!newComment.trim() || !detail.id) return;
    setPosting(true);
    try {
      const r: any = await apiRequest(`/api/events/${encodeURIComponent(String(detail.id))}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: newComment.trim() }),
      });
      const me =
        typeof window !== "undefined" ? JSON.parse(localStorage.getItem("user") || "null") : null;
      setComments((prev) => [
        {
          id: r?.id ?? Date.now(),
          user: { id: me?.id, name: me?.nickname ?? me?.name ?? "나", avatar: me?.avatar ?? null },
          content: newComment.trim(),
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setNewComment("");
      await reloadComments(String(detail.id));
    } catch (e) {
      console.error("[comments] create failed:", e);
    } finally {
      setPosting(false);
    }
  }

  async function deleteComment(commentId: number | string) {
    if (!detail.id) return;
    setDeletingId(commentId);
    try {
      await apiRequest(
        `/api/events/${encodeURIComponent(String(detail.id))}/comments/${commentId}`,
        { method: "DELETE" }
      );
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (e) {
      console.error("[comments] delete failed:", e);
    } finally {
      setDeletingId(null);
    }
  }

  if (!eventId) {
    return <div className="min-h-screen grid place-items-center text-destructive">유효하지 않은 이벤트 ID 입니다.</div>;
  }
  if (loading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">불러오는 중...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        {error && (
          <div className="mb-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded p-3">
            {error}
          </div>
        )}

        {/* 기본 정보 */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-2xl mb-2">{detail.title}</CardTitle>
                <div className="flex flex-wrap items-center gap-4 text-muted-foreground mb-4">
                  <div className="flex items-center">
                    <MapPin className="w-4 h-4 mr-1" />
                    {detail.location ?? "장소 미정"}
                  </div>
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 mr-1" />
                    {dateLabel ?? "시간 미정"}
                    {detail.startHHMM && ` (${detail.startHHMM}${detail.endHHMM ? `-${detail.endHHMM}` : ""})`}
                  </div>
                </div>
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <Users className="w-4 h-4 mr-1" />
                {detail.currentParticipants ?? 1}/{detail.maxParticipants ?? DEFAULT_MAX}
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <p className="text-foreground mb-6">{detail.description ?? "내용 없음"}</p>

            {detail.host && (
              <div className="flex items-center gap-3 mb-6">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={detail.host.avatar ?? undefined} />
                  <AvatarFallback>{(detail.host.name ?? "호")[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <span className="font-medium">{detail.host.name ?? "호스트"}</span>
                  <Badge variant="outline" className="ml-2 text-xs">호스트</Badge>
                </div>
              </div>
            )}

            {/* 참여하기 → 확인 다이얼로그 (채팅 연결 그대로) */}
            <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
              <DialogTrigger asChild>
                <Button className="w-full" disabled={!detail.id}>참여하기</Button>
              </DialogTrigger>

              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>밥약 참여 신청</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground mb-4">
                  ‘{detail.title}’ 밥약에 참여하시겠습니까?
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 h-10 bg-transparent"
                    onClick={() => setShowApplyDialog(false)}
                  >
                    취소
                  </Button>
                  <Button
                    className="flex-1 h-10"
                    onClick={() => {
                      setShowApplyDialog(false);
                      router.push(`/chat/${detail.id}`);
                    }}
                  >
                    참여하기
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* 참여자 */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">참여자 ({detail.participants.length}명)</CardTitle>
          </CardHeader>
          <CardContent>
            {detail.participants.length === 0 ? (
              <div className="text-sm text-muted-foreground">아직 참여자가 없습니다.</div>
            ) : (
              <div className="space-y-3">
                {detail.participants.map((p, idx) => {
                  const displayName = p.name ?? p.nickname ?? "사용자";
                  return (
                    <div key={String(p.id ?? idx)} className="flex items-center gap-3">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={p.avatar ?? undefined} />
                        <AvatarFallback>{displayName[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <span className="font-medium">{displayName}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 댓글(그대로) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">댓글 ({comments.length}개)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 mb-4">
              <Textarea
                placeholder="댓글을 작성해주세요..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows={2}
              />
              <Button size="sm" onClick={createComment} disabled={posting || !newComment.trim()}>
                {posting ? "작성 중..." : "댓글 작성"}
              </Button>
            </div>

            <Separator className="my-4" />

            <div className="space-y-4">
              {comments.map((c) => (
                <div key={String(c.id)} className="flex gap-3">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={c.user?.avatar ?? undefined} />
                    <AvatarFallback>{(c.user?.name ?? "유")[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{c.user?.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(c.createdAt).toLocaleDateString("ko-KR")}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteComment(c.id)}
                        disabled={deletingId === c.id}
                        className="text-destructive"
                        title="삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{c.content}</p>
                  </div>
                </div>
              ))}

              {comments.length === 0 && (
                <div className="text-sm text-muted-foreground">아직 댓글이 없습니다.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
