// app/chats/[eventId]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Send, Loader2, LogOut } from "lucide-react";

import { apiRequest, userAPI, getAuthToken } from "@/lib/api";
import { chatAPI, openChatSocket, type ChatMessage } from "@/lib/api";

const POLL_MS = 3500;

/** WebSocket 인증 토큰을 어디에 있든 찾아서 'token' 키로 정착시킨다. */
function resolveWsToken(): string {
  if (typeof window === "undefined") return "";
  const t1 = localStorage.getItem("token");
  if (t1) return t1;

  const t2 =
    localStorage.getItem("authToken") ||
    localStorage.getItem("accessToken") ||
    "";
  const t3 = t2 || getAuthToken() || ""; // getAuthToken: localStorage→cookie fallback
  if (t3) localStorage.setItem("token", t3); // ✅ 마이그레이션
  return t3;
}

const isAuthError = (err: any) => {
  const s = Number(err?.status || err?.response?.status || err?.code || 0);
  const code = err?.payload?.error?.errorCode;
  const msg = String(err?.payload?.error?.reason || err?.message || "").toLowerCase();
  return s === 401 || s === 403 || code === "U003" || msg.includes("unauthorized") || msg.includes("forbidden") || msg.includes("로그인");
};

const isDup = (a: ChatMessage, b: ChatMessage) => {
  const ta = new Date(a.createdAt || "").getTime();
  const tb = new Date(b.createdAt || "").getTime();
  const secSame = Number.isFinite(ta) && Number.isFinite(tb) && Math.abs(ta - tb) < 1000;
  return String(a.userId) === String(b.userId) && a.content === b.content && secSame;
};

const ts = (m: ChatMessage) => {
  const t = new Date(m.createdAt ?? "").getTime();
  if (Number.isFinite(t)) return t;
  const idNum = Number(m.id);
  return Number.isFinite(idNum) ? idNum : 0;
};
const sortAsc = (list: ChatMessage[]) => [...list].sort((a, b) => ts(a) - ts(b));

const fmtTime = (iso?: string) => {
  try {
    return new Date(iso || "").toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: true });
  } catch {
    return "";
  }
};

type ChatItem = ChatMessage & { nickname?: string | null };

export default function ChatRoomPage() {
  const router = useRouter();
  const { eventId: eventIdParam } = useParams<{ eventId: string }>();
  const search = useSearchParams();
  const titleFromQuery = search?.get("t") ?? "";

  const eventId = useMemo(() => {
    const n = Number(eventIdParam);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [eventIdParam]);

  const [loading, setLoading] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [wsReady, setWsReady] = useState(false);
  const [guardMsg, setGuardMsg] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [text, setText] = useState("");

  /** userId -> nickname 캐시 */
  const [userMap, setUserMap] = useState<Record<string, string>>({});

  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const me = useMemo(() => {
    if (typeof window === "undefined") return { id: null as number | null, nickname: "나" };
    try {
      const u = JSON.parse(localStorage.getItem("user") || "null");
      return { id: u?.id ?? null, nickname: u?.nickname ?? "나" } as { id: number | null; nickname: string };
    } catch {
      return { id: null, nickname: "나" };
    }
  }, []);
  const meId = me.id;

  /** 닉네임 채우기 */
  const ensureUsers = async (ids: Array<number | null | undefined>) => {
    const wants = Array.from(
      new Set(
        ids
          .filter((x): x is number => typeof x === "number" && Number.isFinite(x))
          .filter((id) => String(id) !== String(meId))
          .filter((id) => userMap[String(id)] == null)
      )
    );
    if (wants.length === 0) return;
    try {
      const results = await Promise.allSettled(
        wants.map(async (id) => {
          const r = (await userAPI.getUserProfile(id)) as any;
          const body = r?.success ?? r?.data ?? r?.user ?? r;
          const nn = body?.nickname ?? null;
          return { id, nickname: nn as string | null };
        })
      );
      const next: Record<string, string> = {};
      for (const it of results) {
        if (it.status === "fulfilled" && it.value?.id != null) {
          next[String(it.value.id)] = it.value.nickname ?? `#${it.value.id}`;
        }
      }
      if (Object.keys(next).length) setUserMap((prev) => ({ ...prev, ...next }));
    } catch {}
  };

  useEffect(() => {
    const id = setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
    return () => clearTimeout(id);
  }, [messages]);

  useEffect(() => {
    if (eventId == null) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { items } = await chatAPI.getChatRoom(eventId, { size: 30 });
        if (!cancelled) {
          const withNick: ChatItem[] = items.map((m: any) => ({
            ...m,
            nickname: m.nickname ?? m.user?.nickname ?? m.users?.nickname ?? null,
          }));
          const asc = sortAsc(withNick);
          setMessages(asc);
          ensureUsers(asc.map((m) => m.userId));
        }
      } catch (e1) {
        try {
          const raw = await apiRequest(`/api/chats/${eventId}?size=30`);
          const d = (raw as any)?.data ?? raw;
          const list: any[] = Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : [];
          const items: ChatItem[] = list.map((m: any) => ({
            id: m.id,
            userId: m.userId ?? m.user_id ?? m.user?.id ?? null,
            content: String(m.content ?? ""),
            createdAt: String(m.createdAt ?? m.created_at ?? new Date().toISOString()),
            nickname: m.nickname ?? m.user?.nickname ?? m.users?.nickname ?? null,
          }));
          if (!cancelled) {
            const asc = sortAsc(items);
            setMessages(asc);
            ensureUsers(asc.map((m) => m.userId));
          }
        } catch (err) {
          if (isAuthError(err)) setGuardMsg("이 채팅방은 참여 신청한 사용자만 입장할 수 있어요.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };
  const startPolling = () => {
    stopPolling();
    if (eventId == null) return;
    pollRef.current = setInterval(async () => {
      try {
        const { items: next0 } = await chatAPI.getChatRoom(eventId, { size: 30 });
        const next = next0.map((m: any) => ({
          ...m,
          nickname: m.nickname ?? m.user?.nickname ?? m.users?.nickname ?? null,
        })) as ChatItem[];
        const asc = sortAsc(next);
        setMessages((prev) => {
          if (asc.length !== prev.length) return asc;
          const a = prev[prev.length - 1]?.content;
          const b = asc[asc.length - 1]?.content;
          return a === b ? prev : asc;
        });
        ensureUsers(asc.map((m) => m.userId));
      } catch (err) {
        if (isAuthError(err)) {
          setGuardMsg("이 채팅방은 참여 신청한 사용자만 입장할 수 있어요.");
          stopPolling();
        }
      }
    }, POLL_MS);
  };

  useEffect(() => {
    if (eventId == null) return;

    const token = resolveWsToken(); // ✅ 토큰 확보 & token 키로 정착

    const ws = openChatSocket(eventId, {
      token, // ✅ URL(&token=) + Subprotocol('token:<jwt>') 둘 다 전달됨
      onOpen: () => { setWsReady(true); stopPolling(); },
      onClose: () => { setWsReady(false); startPolling(); },
      onError: () => { setWsReady(false); try { ws.close(); } catch {} startPolling(); },
      onMessage: (data: any) => {
        if (!data) return;
        if (data.type === "chat:new" && data.data) {
          const m: ChatItem = {
            id: data.data.id,
            userId: data.data.userId ?? data.data.user?.id ?? null,
            content: data.data.content ?? "",
            createdAt: data.data.createdAt ?? data.data.created_at ?? new Date().toISOString(),
          };
          if (m.content) {
            setMessages((prev) => (prev.some((x) => isDup(x, m)) ? prev : sortAsc([...prev, m])));
            ensureUsers([m.userId]);
          }
        }
      },
    });

    wsRef.current = ws;
    const fallbackTimer = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) startPolling();
    }, 1200);

    return () => {
      clearTimeout(fallbackTimer);
      stopPolling();
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
  }, [eventId]);

  const send = async () => {
    if (eventId == null) return;
    const content = text.trim();
    if (!content) return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "chat:send", content }));
      setMessages((prev) =>
        sortAsc([
          ...prev,
          { id: `tmp-${Date.now()}`, userId: meId ?? null, content, createdAt: new Date().toISOString(), nickname: me.nickname },
        ])
      );
      setText("");
      return;
    }

    try {
      await chatAPI.sendMessage(eventId, { content });
      setText("");
      const { items } = await chatAPI.getChatRoom(eventId, { size: 30 });
      const asc = sortAsc(items as ChatItem[]);
      setMessages(asc);
    } catch (e) {
      console.warn("메시지 전송 실패:", e);
    }
  };

  const leave = async () => {
    if (eventId == null) return;
    setLeaving(true);
    try {
      await chatAPI.leaveChat(eventId);
      try { wsRef.current?.close(); } catch {}
      router.replace("/chats");
    } catch (e) {
      console.error("[chatRoom] leave failed:", e);
      router.replace(`/events/${eventId}`);
    } finally {
      setLeaving(false);
    }
  };

  const getNickname = (m: ChatItem) => {
    if (m.userId == null) return "익명";
    if (String(m.userId) === String(meId)) return me.nickname || "나";
    return m.nickname ?? userMap[String(m.userId)] ?? `#${m.userId}`;
  };
  const getInitial = (name: string) => (name?.trim()?.[0] ?? "?");

  if (eventId == null) {
    return <div className="min-h-screen grid place-items-center text-destructive">유효하지 않은 채팅방 ID입니다.</div>;
  }

  if (guardMsg) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="sticky top-0 z-10 bg-card border-b border-border">
          <div className="container mx-auto px-4 py-3 flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="font-semibold flex-1">{titleFromQuery || `채팅방 #${eventIdParam}`}</div>
          </div>
        </div>
        <div className="container mx-auto px-4 py-6 max-w-3xl">
          <Card className="p-4">
            <div className="text-sm text-destructive">{guardMsg}</div>
            <div className="mt-3">
              <Button onClick={() => router.push(`/events/${eventIdParam}`)}>이벤트로 이동</Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-card border-b border-border">
        <div className="container mx-auto px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="font-semibold flex-1">{titleFromQuery || `채팅방 #${eventIdParam}`}</div>
          <Button variant="outline" size="sm" onClick={leave} disabled={leaving}>
            {leaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LogOut className="w-4 h-4 mr-2" />}
            나가기
          </Button>
        </div>
      </div>

      {/* 본문 */}
      <div className="container mx-auto flex-1 px-4 py-4 w-full max-w-3xl">
        <Card className="h-[68vh] overflow-y-auto p-4">
          {loading ? (
            <div className="text-sm text-muted-foreground">불러오는 중…</div>
          ) : messages.length === 0 ? (
            <div className="text-sm text-muted-foreground">대화를 시작해보세요.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {messages.map((m, idx) => {
                const mine = meId != null && String(m.userId ?? "") === String(meId);
                const name = getNickname(m);
                const prev = messages[idx - 1];
                const showHeader = !mine && (!prev || String(prev?.userId) !== String(m.userId));
                return (
                  <div key={String(m.id ?? idx)} className={`w-full flex ${mine ? "justify-end" : "justify-start"}`}>
                    {!mine ? (
                      <div className="flex items-end gap-2 max-w-[85%]">
                        <div className="w-8 h-8 rounded-full bg-muted grid place-items-center text-xs text-foreground/80 select-none">
                          {getInitial(name)}
                        </div>
                        <div className="flex flex-col gap-1">
                          {showHeader && <div className="text-[11px] text-foreground/60 leading-none">{name}</div>}
                          <div className="flex items-end gap-1">
                            <div
                              className="inline-block rounded-2xl px-3 py-2 text-sm bg-muted"
                              title={m.createdAt ? new Date(m.createdAt).toLocaleString("ko-KR") : ""}
                            >
                              {m.content}
                            </div>
                            <div className="text-[10px] text-muted-foreground/70">{fmtTime(m.createdAt)}</div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-end gap-1 max-w-[85%]">
                        <div className="text-[10px] text-muted-foreground/70">{fmtTime(m.createdAt)}</div>
                        <div
                          className="inline-block rounded-2xl px-3 py-2 text-sm bg-yellow-300 text-black"
                          title={m.createdAt ? new Date(m.createdAt).toLocaleString("ko-KR") : ""}
                        >
                          {m.content}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </Card>

        {/* 입력 */}
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <Input
            placeholder="메시지를 입력하세요…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button type="submit" disabled={!text.trim()}>
            <Send className="w-4 h-4 mr-1" />
            보내기
          </Button>
        </form>

        {!wsReady && (
          <div className="mt-2 text-xs text-muted-foreground">
            실시간 연결이 꺼져 있어 주기적으로 새 메시지를 불러오고 있어요.
          </div>
        )}
      </div>
    </div>
  );
}
