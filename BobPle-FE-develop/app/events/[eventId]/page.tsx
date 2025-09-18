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
import { MapPin, Clock, Users, Trash2 } from "lucide-react";

import { apiRequest, eventAPI } from "@/lib/api";
import { eventAPI_mutation } from "@/lib/api.routes";

/* ────────────────────────────────────────────────────────────
   상수
──────────────────────────────────────────────────────────── */
const DEFAULT_MAX = 4;

/* ────────────────────────────────────────────────────────────
   타입
──────────────────────────────────────────────────────────── */
type Participant = {
  id?: number | string;
  nickname?: string;
  name?: string;
  avatar?: string | null;
};
type CommentItem = {
  id: number | string;
  creatorId?: number | string;
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

/* ────────────────────────────────────────────────────────────
   유틸
──────────────────────────────────────────────────────────── */
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

async function fetchRestaurantById(
  restaurantId: number
): Promise<{ name?: string | null; address?: string | null }> {
  // 1순위: ID 조회
  try {
    const r = await apiRequest(`/api/restaurants/${restaurantId}`);
    const d = r?.data ?? r;
    if (d)
      return {
        name: d.name ?? d.restaurantName ?? null,
        address: d.address ?? d.roadAddress ?? null,
      };
  } catch {}
  // 2순위: 검색에서 ID 매칭
  try {
    const r = await apiRequest(`/api/restaurants?q=${encodeURIComponent(String(restaurantId))}`);
    const d = r?.data ?? r;
    const list: any[] = Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : [];
    const hit = list.find((x) => Number(x.id) === Number(restaurantId));
    if (hit)
      return {
        name: hit.name ?? hit.restaurantName ?? null,
        address: hit.address ?? hit.roadAddress ?? null,
      };
  } catch {}
  return { name: null, address: null };
}

/* ────────────────────────────────────────────────────────────
   컴포넌트
──────────────────────────────────────────────────────────── */
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

  const [meId, setMeId] = useState<number | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [myApplicationId, setMyApplicationId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const me = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  }, []);

  const dateLabel = useMemo(() => toDateLabel(detail.startISO), [detail.startISO]);
  const isApplied = myApplicationId != null && Number(myApplicationId) > 0;

  // ★ 참가자(호스트 포함) 여부 → 채팅방 버튼 노출 기준
  const amIParticipant = useMemo(() => {
    const my = Number(meId);
    if (!Number.isFinite(my)) return false;
    const listed = detail.participants?.some((p) => Number(p.id) === my);
    return listed || isHost;
  }, [meId, detail.participants, isHost]);

  /* ─────────────────────────────────────────────
   * 프로필 이동 유틸 (나 → /profile, 타인 → /profile/:id)
   * ──────────────────────────────────────────── */
  const goProfile = (userId?: number | string) => {
    if (userId == null) return;
    const my = Number(meId);
    const target = Number(userId);
    if (Number.isFinite(my) && Number.isFinite(target) && my === target) {
      router.push("/profile");
    } else {
      router.push(`/profile/${encodeURIComponent(String(userId))}`);
    }
  };

  /* ─────────────────────────────────────────────
   * 초기 로드
   * ──────────────────────────────────────────── */
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

        let location: string | null = row.restaurantAddress ?? row.restaurantName ?? null;
        if (!location && row.restaurantId) {
          const r = await fetchRestaurantById(Number(row.restaurantId));
          location = r.address ?? r.name ?? `식당 #${row.restaurantId}`;
        }

        const participants: Participant[] = Array.isArray(row.participants)
          ? row.participants.map((p: any) => ({
              id: p.id ?? p.userId ?? p.user_id,
              nickname: p.nickname ?? p.nickName ?? p.name,
              name: p.nickname ?? p.nickName ?? p.name,
              avatar: p.avatar ?? null,
            }))
          : [];

        const host = {
          id: row.creatorId ?? row.creator_id ?? undefined,
          name: row.creatorNickname ?? row.creator_name ?? "호스트",
          avatar: null,
        };

        const hasHost = host.id != null && participants.some((p) => String(p.id ?? "") === String(host.id ?? ""));
        const mergedParticipants: Participant[] = hasHost
          ? participants
          : [{ id: host.id, name: host.name, nickname: host.name, avatar: host.avatar }, ...participants];

        const displayCount = mergedParticipants.length;

        const nicknameMapFromRow = new Map<string, string>();
        if (host.id && host.name) nicknameMapFromRow.set(String(host.id), host.name);
        for (const p of mergedParticipants) {
          if (p?.id && (p?.name || p?.nickname)) nicknameMapFromRow.set(String(p.id), p.name ?? p.nickname!);
        }
        if (me?.id && (me?.nickname || me?.name)) nicknameMapFromRow.set(String(me.id), me.nickname ?? me.name);

        setDetail({
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
        });

        // meId, host 여부, 내 신청 ID
        const meFromServer = Number(row.me?.id ?? row.meId ?? row.userId ?? NaN);
        const meFromLS = Number(me?.id ?? NaN);
        const myId = Number.isFinite(meFromServer) ? meFromServer : Number.isFinite(meFromLS) ? meFromLS : null;
        setMeId(myId);

        const hostId = Number(row.creatorId ?? row.creator_id ?? row.hostId ?? NaN);
        setIsHost(myId != null && Number.isFinite(hostId) && hostId === myId);

        const appId = Number(row.myApplicationId ?? row.my_application_id ?? NaN);
        setMyApplicationId(Number.isFinite(appId) && appId > 0 ? appId : null);

        if ((!Number.isFinite(appId) || !(appId > 0)) && typeof window !== "undefined") {
          const saved = Number(localStorage.getItem(`appId:${row.id}`) ?? NaN);
          if (Number.isFinite(saved) && saved > 0) setMyApplicationId(saved);
        }

        await reloadComments(String(row.id), nicknameMapFromRow);
      } catch (e: any) {
        console.error("[event:detail] load failed:", e);
        setError(e?.message || "상세를 불러오지 못했습니다.");
        setComments([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId, me]);

  /* ─────────────────────────────────────────────
   * 댓글 로드/작성/삭제
   * ──────────────────────────────────────────── */
  async function reloadComments(idForComments: string, nicknameMap?: Map<string, string>) {
    try {
      const r: any = await apiRequest(`/api/events/${encodeURIComponent(idForComments)}/comments`);
      const rawList: any[] = Array.isArray(r?.items) ? r.items : Array.isArray(r) ? r : [];

      const mapped: CommentItem[] = rawList.map((c: any) => {
        const uid =
          c.creatorId ??
          c.creator_id ??
          c.author?.id ??
          c.user?.id ??
          c.users?.id ??
          undefined;

        const payloadName =
          c.nickname ??
          c.nickName ??
          c.userNickname ??
          c.user_nickname ??
          c.userName ??
          c.user_name ??
          null;

        const relationName =
          c.user?.nickname ??
          c.users?.nickname ??
          c.creator?.nickname ??
          c.author?.nickname ??
          c.user?.name ??
          c.users?.name ??
          c.creator?.name ??
          c.author?.name ??
          null;

        const fromMap = uid != null ? nicknameMap?.get(String(uid)) : undefined;
        const displayName = (payloadName || relationName || fromMap || "사용자") as string;

        const avatar =
          c.avatar ??
          c.user?.avatar ??
          c.users?.avatar ??
          c.creator?.avatar ??
          c.author?.avatar ??
          null;

        return {
          id: c.id,
          creatorId: uid,
          user: { id: uid, name: displayName, avatar },
          content: c.content ?? "",
          createdAt: c.created_at ?? c.createdAt ?? new Date().toISOString(),
        };
      });

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
      const creatorId = Number(me?.id);
      const eventNumericId = Number(detail.id);
      if (!Number.isFinite(creatorId)) throw new Error("로그인 사용자 ID를 찾을 수 없습니다.");
      if (!Number.isFinite(eventNumericId)) throw new Error("이벤트 ID가 유효하지 않습니다.");

      const send = (body: any) =>
        apiRequest(`/api/events/${encodeURIComponent(String(detail.id))}/comments`, {
          method: "POST",
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" } as any,
        });

      try {
        await send({ content: newComment.trim(), creatorId, eventId: eventNumericId });
      } catch (err: any) {
        if (String(err?.message || "").toLowerCase().includes("invalid creatorid")) {
          await send({
            content: newComment.trim(),
            creator_id: creatorId,
            event_id: eventNumericId,
          });
        } else {
          throw err;
        }
      }

      setNewComment("");

      const map = new Map<string, string>();
      if (detail?.host?.id && detail?.host?.name) map.set(String(detail.host.id), detail.host.name!);
      for (const p of detail.participants ?? []) {
        const nm = p?.name || p?.nickname;
        if (p?.id && nm) map.set(String(p.id), nm);
      }
      if (me?.id && (me?.nickname || me?.name)) map.set(String(me.id), me.nickname ?? me.name);

      await reloadComments(String(detail.id), map);
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
      await apiRequest(`/api/events/${encodeURIComponent(String(detail.id))}/comments/${commentId}`, {
        method: "DELETE",
      });
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (e) {
      console.error("[comments] delete failed:", e);
    } finally {
      setDeletingId(null);
    }
  }

  /* ─────────────────────────────────────────────
   * 참여하기 / 신청 취소
   * ──────────────────────────────────────────── */
  const applyToEvent = async () => {
    if (!meId) {
      alert("로그인이 필요합니다.");
      return;
    }
    if (!detail.id || busy) return;

    const prevAppId = myApplicationId;
    const prevParts = detail.participants;
    const prevCount = detail.currentParticipants ?? prevParts.length;

    setBusy(true);
    try {
      // Optimistic UI
      if (me?.id) {
        const already = prevParts.some((p) => String(p.id) === String(me.id));
        if (!already) {
          setDetail((prev) => ({
            ...prev,
            participants: [
              ...prev.participants,
              {
                id: me.id,
                name: me.nickname ?? me.name ?? "나",
                nickname: me.nickname ?? me.name ?? "나",
                avatar: me?.avatar ?? null,
              },
            ],
            currentParticipants: prevCount + 1,
          }));
        }
      }

      const res: any = await eventAPI_mutation.applyToEvent(Number(detail.id));

      const pickNumber = (v: any) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : NaN);
      const newIdCandidates = [
        res?.applicationId,
        res?.success?.applicationId,
        res?.success?.id,
        res?.id,
        res?.data?.id,
      ];
      const picked = newIdCandidates.map(pickNumber).find((n) => Number.isFinite(n)) as number | undefined;

      if (picked) {
        setMyApplicationId(picked);
        if (typeof window !== "undefined") localStorage.setItem(`appId:${detail.id}`, String(picked));
      } else {
        // fallback: 최신 상세로 재조회
        const fresh: any = await eventAPI.getEvent(String(detail.id));
        const appId =
          pickNumber(fresh?.myApplicationId) ||
          pickNumber(fresh?.my_application_id) ||
          pickNumber((fresh?.success ?? {}).id);
        if (appId) {
          setMyApplicationId(appId);
          if (typeof window !== "undefined") localStorage.setItem(`appId:${detail.id}`, String(appId));
        } else {
          throw new Error("신청은 처리됐지만 신청 ID 확인에 실패했습니다.");
        }
      }
    } catch (e: any) {
      // rollback
      setMyApplicationId(prevAppId ?? null);
      setDetail((prev) => ({
        ...prev,
        participants: prevParts,
        currentParticipants: prevCount,
      }));
      alert(e?.message || "신청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const cancelApplication = async () => {
    const appIdNum = Number(myApplicationId);
    if (!detail.id || !Number.isFinite(appIdNum) || appIdNum <= 0 || busy) return;

    const prevAppId = myApplicationId;
    const prevParts = detail.participants;
    const prevCount = detail.currentParticipants ?? prevParts.length;

    setBusy(true);
    try {
      // Optimistic UI
      if (me?.id) {
        const removed = prevParts.filter((p) => String(p.id) !== String(me.id));
        setDetail((prev) => ({
          ...prev,
          participants: removed,
          currentParticipants: Math.max(0, prevCount - 1),
        }));
      }

      await eventAPI_mutation.cancelApplication(Number(detail.id), appIdNum);
      setMyApplicationId(null);
      if (typeof window !== "undefined") localStorage.removeItem(`appId:${detail.id}`);
    } catch (e: any) {
      // rollback
      setMyApplicationId(prevAppId);
      setDetail((prev) => ({
        ...prev,
        participants: prevParts,
        currentParticipants: prevCount,
      }));
      alert(e?.message || "신청 취소에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  /* ─────────────────────────────────────────────
   * 렌더
   * ──────────────────────────────────────────── */
  if (!eventId) {
    return (
      <div className="min-h-screen grid place-items-center text-destructive">
        유효하지 않은 이벤트 ID 입니다.
      </div>
    );
  }
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">
        불러오는 중...
      </div>
    );
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
                {detail.currentParticipants ?? 0}/{detail.maxParticipants ?? DEFAULT_MAX}
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <p className="text-foreground mb-6">{detail.description ?? "내용 없음"}</p>

            {detail.host && (
              <div
                className="flex items-center gap-3 mb-6 cursor-pointer select-none"
                onClick={() => goProfile(detail.host?.id)}
                title="프로필 보기"
              >
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

            {/* 액션 버튼 */}
            <div className="flex gap-2">
              {isHost ? (
                <>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => router.push(`/events/${detail.id}/edit`)}
                    disabled={busy}
                  >
                    수정
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    disabled={busy}
                    onClick={async () => {
                      if (!detail.id) return;
                      if (!confirm("이 밥약을 삭제(취소)할까요?")) return;
                      try {
                        setBusy(true);
                        await apiRequest(`/api/events/${detail.id}`, { method: "DELETE" });
                        router.replace("/");
                      } catch (e: any) {
                        alert(e?.message || "삭제에 실패했습니다.");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    삭제
                  </Button>
                </>
              ) : isApplied ? (
                <Button variant="outline" className="w-full" disabled={busy} onClick={cancelApplication}>
                  신청 취소
                </Button>
              ) : (
                <Button className="w-full" disabled={busy} onClick={applyToEvent}>
                  참여하기
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 참여자 + 채팅방 버튼 */}
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
                  const uid = p.id;
                  return (
                    <div
                      key={String(uid ?? idx)}
                      className="flex items-center gap-3 cursor-pointer select-none"
                      onClick={() => goProfile(uid)}
                      title="프로필 보기"
                    >
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

            {/* ★ 호스트 포함: 참가자만 채팅방 입장 가능 */}
            {amIParticipant && (
              <div className="mt-4">
                <Button
  className="w-full"
  onClick={() => {
    const eid = String(detail.id ?? eventId);               // 안전한 ID
    const t   = (detail.title ?? "").trim();                // 제목
    router.push(`/chats/${eid}?t=${encodeURIComponent(t)}`); // 제목을 쿼리로 전달
  }}
>
                  채팅방 입장하기
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 댓글 */}
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
              {comments.map((c) => {
                const canDelete = meId != null && c.creatorId != null && Number(meId) === Number(c.creatorId);
                const uid = c.user?.id;
                return (
                  <div key={String(c.id)} className="flex gap-3">
                    <div
                      className="flex-shrink-0 cursor-pointer select-none"
                      onClick={() => goProfile(uid)}
                      title="프로필 보기"
                    >
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={c.user?.avatar ?? undefined} />
                        <AvatarFallback>{(c.user?.name ?? "유")[0]}</AvatarFallback>
                      </Avatar>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="font-medium text-sm cursor-pointer select-none"
                            onClick={() => goProfile(uid)}
                            title="프로필 보기"
                          >
                            {c.user?.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(c.createdAt).toLocaleDateString("ko-KR")}
                          </span>
                        </div>
                        {canDelete && (
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
                        )}
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{c.content}</p>
                    </div>
                  </div>
                );
              })}

              {comments.length === 0 && <div className="text-sm text-muted-foreground">아직 댓글이 없습니다.</div>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
