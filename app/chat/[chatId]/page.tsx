"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Send, Loader2, LogOut } from "lucide-react";
import { chatAPI } from "@/lib/api";
const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "1";
type ChatMessage = {
  id?: number | string;
  user_id?: number | string;
  content: string;
  created_at?: string; // ISO
};

function wsUrlForChat(chatId: string | number) {
  // .env 예시:
  // NEXT_PUBLIC_WS_URL=ws://localhost:3000   -> 최종: ws://localhost:3000/ws/chats/:id
  // 혹은 wss://example.com
  const base = process.env.NEXT_PUBLIC_WS_URL?.replace(/\/+$/, "") || "";
  if (!base) return "";
  return `${base}/ws/chats/${chatId}`;
}

export default function ChatRoomPage() {
  const router = useRouter();
  const { chatId } = useParams<{ chatId: string }>();

  const [loading, setLoading] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [wsReady, setWsReady] = useState(false);

  const meId = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const s = localStorage.getItem("user");
      const u = s ? JSON.parse(s) : null;
      return u?.id ?? null;
    } catch {
      return null;
    }
  }, []);

  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<any>(null);

  // 스크롤 맨 아래로
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // 초기 로드 + 실시간 수신
  useEffect(() => {
    let cancelled = false;

    const loadInitial = async () => {
      setLoading(true);
      try {
        const list = await chatAPI.getChatRoom(Number(chatId)).catch((err) => {
  if (DEBUG) console.error("[chatRoom] getChatRoom failed:", chatId, err);
  return [];
});
        if (!cancelled) setMessages(Array.isArray(list) ? list : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const setupRealtime = () => {
      const url = wsUrlForChat(chatId);
      if (!url) {
        // 웹소켓 베이스 미설정 → 폴링으로 대체
        startPolling();
        return;
      }

      try {
        const token =
          (typeof window !== "undefined" && localStorage.getItem("authToken")) || "";
        const ws = new WebSocket(token ? `${url}?token=${encodeURIComponent(token)}` : url);
        wsRef.current = ws;

        ws.onopen  = () => { setWsReady(true); if (DEBUG) console.log("[chatRoom] ws open:", chatId); };
        ws.onclose = (ev) => { if (DEBUG) console.warn("[chatRoom] ws close:", ev.code, ev.reason); setWsReady(false); startPolling(); };
        ws.onerror = (ev) => { if (DEBUG) console.error("[chatRoom] ws error:", ev); setWsReady(false); try{ws.close();}catch{} startPolling(); };
        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            // 서버에서 내려주는 형태에 따라 키 흡수
            const msg: ChatMessage = {
              id: data?.id,
              user_id: data?.user_id ?? data?.userId,
              content: data?.content ?? "",
              created_at: data?.created_at ?? data?.createdAt ?? new Date().toISOString(),
            };
            if (msg.content) {
              setMessages((prev) => [...prev, msg]);
            }
          } catch {
            // 텍스트 메시지라면 간단히 붙임
            if (typeof ev.data === "string" && ev.data.trim()) {
              setMessages((prev) => [
                ...prev,
                { content: String(ev.data), created_at: new Date().toISOString() },
              ]);
            }
          }
        };
      } catch {
        startPolling();
      }
    };

    const startPolling = () => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        const list = await chatAPI.getChatRoom(Number(chatId)).catch((err) => {
  if (DEBUG) console.error("[chatRoom] poll failed:", err);
  return null;
});
        if (!Array.isArray(list)) return;
        // 마지막 N개만 반영 (간단 비교)
        setMessages((prev) => {
          if (list.length !== prev.length) return list;
          // 길이가 같으면 마지막 한두 개만 비교
          const a = prev[prev.length - 1]?.content;
          const b = list[list.length - 1]?.content;
          return a === b ? prev : list;
        });
      }, 3500);
    };

    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    const cleanup = () => {
      stopPolling();
      try {
        wsRef.current?.close();
      } catch {}
      wsRef.current = null;
    };

    loadInitial().then(setupRealtime);
    return cleanup;
  }, [chatId]);

  const send = async () => {
    const content = text.trim();
    if (!content) return;

    // 1) REST로 전송 (명세: POST /api/chats/{chatId})
    try {
  await chatAPI.sendMessage(Number(chatId), content);
} catch (e) {
  if (DEBUG) console.error("[chatRoom] sendMessage failed:", e);
}

    // 2) 소켓이 열려 있으면 한번 더 신호
    try {
      if (wsRef.current && wsReady) {
        wsRef.current.send(JSON.stringify({ type: "chat_message", content }));
      }
    } catch {}

    // 낙관적 추가
    setMessages((prev) => [
      ...prev,
      {
        content,
        user_id: meId ?? undefined,
        created_at: new Date().toISOString(),
      },
    ]);
    setText("");
  };

  const leave = async () => {
    setLeaving(true);
    try {
      await chatAPI.leaveChat(Number(chatId));
      router.replace("/chats");
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="sticky top-0 z-10 bg-card border-b border-border">
        <div className="container mx-auto px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="font-semibold flex-1">채팅방 #{chatId}</div>
          <Button variant="outline" size="sm" onClick={leave} disabled={leaving}>
            {leaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LogOut className="w-4 h-4 mr-2" />}
            나가기
          </Button>
        </div>
      </div>

      <div className="container mx-auto flex-1 px-4 py-4 w-full max-w-3xl">
        <Card className="h-[68vh] overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="text-sm text-muted-foreground">불러오는 중…</div>
          ) : messages.length === 0 ? (
            <div className="text-sm text-muted-foreground">대화를 시작해보세요.</div>
          ) : (
            messages.map((m, idx) => {
              const mine = meId != null && String(m.user_id ?? "") === String(meId);
              return (
                <div key={idx} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      mine ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}
                    title={m.created_at ? new Date(m.created_at).toLocaleString("ko-KR") : ""}
                  >
                    {m.content}
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </Card>

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