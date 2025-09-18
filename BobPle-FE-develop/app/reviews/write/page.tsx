// app/reviews/write/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Star, Users, ArrowLeft } from "lucide-react";
import { apiRequest, eventAPI, authAPI, reviewAPI, getCurrentUser } from "@/lib/api";

/* ===== 화면 타입 ===== */
type Participant = { id: number | string; name: string; avatar?: string | null };
type EventDetailLite = {
  id: number | string;
  title: string;
  participants: any[]; // getEvent() 원본 보관
  creatorId: number | string | null;
  creatorNickname: string | null;
};

/* ===== 화면용 매핑 (정확 경로만) ===== */
function mapParticipant(p: any): Participant {
  const id = p?.user?.id ?? p?.userId ?? p?.user_id ?? p?.id;
  const name = p?.user?.nickname ?? p?.user?.name ?? p?.nickname ?? p?.name ?? "사용자";
  const avatar =
    p?.user?.avatar ?? p?.user?.profile_img ?? p?.avatar ?? p?.profile_img ?? null;
  return { id, name, avatar };
}

/* ===== 본인인지 판별 (원본 participants 원소 기준) ===== */
function isMeParticipant(
  x: any,
  meId: number | string | null,
  meNickname: string | null
) {
  const meIdStr = meId != null ? String(meId) : null;
  const meName = meNickname?.trim() || null;

  const ids = [
    x?.id,
    x?.userId,
    x?.user_id,
    x?.user?.id,
    x?.user?.userId,
    x?.user?.user_id,
  ]
    .filter((v) => v != null)
    .map((v) => String(v));

  if (meIdStr && ids.includes(meIdStr)) return true;

  const pname =
    x?.user?.nickname ?? x?.user?.name ?? x?.nickname ?? x?.name ?? null;
  if (meName && pname && String(pname) === meName) return true;

  return false;
}

export default function ReviewWritePage() {
  const router = useRouter();
  const qs = useSearchParams();
  const eventIdStr = qs.get("eventId");

  const [meId, setMeId] = useState<number | string | null>(null);
  const [meNickname, setMeNickname] = useState<string | null>(null);

  const [detail, setDetail] = useState<EventDetailLite | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [doneCount, setDoneCount] = useState<number>(0);

  /* ── 내 정보 (getProfile + localStorage 보강) ─────────── */
  useEffect(() => {
    (async () => {
      const me = (await authAPI.getProfile().catch(() => null)) ?? null;
      const cached = getCurrentUser();
      setMeId(me?.id ?? cached?.id ?? null);
      setMeNickname(me?.nickname ?? me?.name ?? cached?.nickname ?? cached?.name ?? null);
    })();
  }, []);

  /* ── 이벤트 상세 (정확 필드만 사용 + null 가드) ─────────── */
  useEffect(() => {
    (async () => {
      if (!eventIdStr) {
        setErr("유효하지 않은 접근입니다. eventId가 필요합니다.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setErr(null);
      try {
        const eid = Number.isNaN(Number(eventIdStr)) ? String(eventIdStr) : Number(eventIdStr);
        const raw = await eventAPI.getEvent(eid).catch(() => null as const);
        if (!raw) throw new Error("이벤트 정보를 불러오지 못했습니다.");

        const d: EventDetailLite = {
          id: raw.id,
          title: raw.title,
          participants: Array.isArray(raw.participants) ? raw.participants : [],
          creatorId: (raw as any).creatorId ?? null,
          creatorNickname: (raw as any).creatorNickname ?? null,
        };
        setDetail(d);
      } catch (e: any) {
        setErr(e?.message || "페이지 로드 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, [eventIdStr]);

  /* ── 참가자(원본에서 본인 제외) + 호스트 보강 ──────────── */
  const targetParticipants = useMemo(() => {
    if (!detail) return [];

    // 1) 원본에서 먼저 본인 제외
    const filteredRaw = detail.participants.filter(
      (x) => !isMeParticipant(x, meId, meNickname)
    );

    // 2) 화면용으로 매핑
    let mapped = filteredRaw.map(mapParticipant);

    // 3) 호스트 보강 (creatorId/creatorNickname)
    if (detail.creatorId != null) {
      const exists = mapped.some((p) => String(p.id) === String(detail.creatorId));
      if (!exists) {
        mapped.push({
          id: detail.creatorId,
          name: detail.creatorNickname ?? "호스트",
          avatar: null,
        });
      }
    }

    return mapped.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [detail, meId, meNickname]);

  /* ── ratings 초기화/유지 ─────────────────────────────── */
  useEffect(() => {
    if (!targetParticipants.length) return;
    setRatings((prev) => {
      const next = { ...prev };
      for (const p of targetParticipants) {
        const k = String(p.id);
        if (next[k] == null) next[k] = 0;
      }
      return next;
    });
  }, [targetParticipants]);

  const ratedEntries = useMemo(
    () => Object.entries(ratings).filter(([, s]) => Number(s) > 0),
    [ratings]
  );

  const canSubmit = useMemo(
    () => !!eventIdStr && !submitting && ratedEntries.length > 0,
    [eventIdStr, submitting, ratedEntries.length]
  );

  const setUserRating = (userId: string | number, score: number) =>
    setRatings((p) => ({ ...p, [String(userId)]: score }));

  /* ── 저장 (※ eventId 포함) ───────────────────────────── */
  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setErr(null);
    setDoneCount(0);
    try {
      const eventIdNum = Number(eventIdStr);
      const useEventId =
        Number.isFinite(eventIdNum) ? eventIdNum : (detail?.id as number | undefined);

      const hasCreate =
        typeof (reviewAPI as any)?.createReview === "function" ||
        typeof (reviewAPI as any)?.write === "function";

      const callCreate = async (uid: string, score: number) => {
        const payload: { score: number; eventId?: number } = { score };
        if (useEventId != null) payload.eventId = Number(useEventId);

        if (hasCreate) {
          const fn = (reviewAPI as any).createReview ?? (reviewAPI as any).write;
          // reviewAPI.createReview: (userId: number, { score, comment?, eventId })
          await fn(Number(uid), payload);
        } else {
          await apiRequest(`/api/reviews/${encodeURIComponent(uid)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }
      };

      for (const [uid, s] of ratedEntries) {
        await callCreate(uid, Number(s));
        setDoneCount((n) => n + 1);
      }

      router.replace("/profile");
    } catch (e: any) {
      setErr(e?.error?.reason || e?.reason || e?.message || "리뷰 저장에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ── 렌더 ───────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">불러오는 중…</div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" />
          뒤로
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>리뷰 작성</span>
              {detail && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {detail.title}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            {err && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                {err}
              </div>
            )}

            <div className="space-y-3">
              <div className="text-sm font-medium">참가자별 별점</div>

              {targetParticipants.length === 0 && (
                <div className="text-sm text-muted-foreground">평가할 대상이 없습니다.</div>
              )}

              {targetParticipants.map((p) => {
                const uid = String(p.id);
                const score = ratings[uid] ?? 0;
                return (
                  <div key={uid} className="flex items-center justify-between gap-3 p-3 border rounded-md">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-9 h-9">
                        <AvatarImage src={p.avatar || "/placeholder.svg"} />
                        <AvatarFallback>{(p.name ?? "U").slice(0, 1)}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-xs text-muted-foreground">ID: {uid}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <button key={i} type="button" onClick={() => setUserRating(uid, i)} className="p-1" aria-label={`${p.name} ${i}점`}>
                          <Star className={`w-6 h-6 ${i <= score ? "fill-current text-yellow-500" : "text-gray-300"}`} />
                        </button>
                      ))}
                      <Button type="button" variant="ghost" size="sm" className="ml-1" onClick={() => setUserRating(uid, 0)}>
                        해제
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                이벤트 ID: {detail?.id}
                {submitting && ratedEntries.length > 0 && (
                  <span className="ml-2">전송 중 {doneCount}/{ratedEntries.length}</span>
                )}
              </div>
              <Button disabled={!canSubmit} onClick={handleSubmit}>
                {submitting ? "저장 중..." : `리뷰 저장 (${ratedEntries.length}명)`}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
