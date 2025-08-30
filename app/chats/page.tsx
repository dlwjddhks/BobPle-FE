"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Search } from "lucide-react";

import { eventAPI, chatAPI } from "@/lib/api";
const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "1";
type ChatPreview = {
  id: number | string;         // chatId (= eventId 라는 가정)
  title: string;
  lastMessage?: string | null;
  lastAt?: string | null;      // ISO
  participants?: number | null;
};

const MOCK_CHAT: ChatPreview = {
  id: "mock-1",
  title: "샘플 채팅방",
  lastMessage: "연결되면 실제 데이터가 표시됩니다.",
  lastAt: new Date().toISOString(),
  participants: 2,
};

function formatTime(iso?: string | null) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
  } catch {
    return "";
  }
}

export default function ChatsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ChatPreview[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [usedMock, setUsedMock] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setUsedMock(false);

      try {
        // 1) 내가 참여한 밥약(=채팅방 후보)
        const myEvents: any[] = await eventAPI.getMyEvents().catch(() => {
          // 네트워크/서버 오류
          throw new Error("서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.");
        });

        if (!Array.isArray(myEvents) || myEvents.length === 0) {
          if (!cancelled) {
            setError("참여 중인 채팅방(밥약)이 없습니다.");
            setItems([MOCK_CHAT]);
            setUsedMock(true);
          }
          return;
        }

        // 2) 각 밥약의 최근 메시지 1개씩 가져오기 (과한 호출 방지를 위해 상위 20개만)
        const top = myEvents.slice(0, 20);

        const results = await Promise.allSettled(
          top.map(async (ev: any) => {
            const id = ev?.id ?? ev?.eventId;
            const title = ev?.title ?? "제목 없음";
            let lastMessage: string | null = null;
            let lastAt: string | null = null;

            // GET /api/chats/{chatId}
            const msgs: any[] = await chatAPI.getChatRoom(Number(id)).catch((err) => {
  if (DEBUG) console.error("[chats] getChatRoom failed:", id, err);
  return [];
});
            if (Array.isArray(msgs) && msgs.length) {
              const m = msgs[msgs.length - 1];
              lastMessage = m?.content ?? null;
              lastAt = m?.created_at ?? m?.createdAt ?? null;
            }
            const participants =
              ev?.current_participants ?? ev?.participants ?? ev?.currentParticipants ?? null;

            return { id, title, lastMessage, lastAt, participants } as ChatPreview;
          })
        );

        const previews = results
          .map((r) => (r.status === "fulfilled" ? r.value : null))
          .filter(Boolean) as ChatPreview[];

        if (!cancelled) {
          if (previews.length === 0) {
            // 이벤트는 있지만 채팅 데이터가 전혀 없을 때
            setError("채팅 내역이 없어 샘플 데이터를 보여드려요.");
            setItems([MOCK_CHAT]);
            setUsedMock(true);
          } else {
            setItems(previews);
          }
        }
      } catch (e: any) {
  if (DEBUG) console.error("[chats] load error:", e);
  setError(e?.message || "데이터를 불러오지 못했습니다.");
  setItems([MOCK_CHAT]);
  setUsedMock(true);
} finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 목업일 때는 검색으로 사라지지 않게 그대로 노출
  const filtered = useMemo(() => {
    if (usedMock) return items;
    if (!q.trim()) return items;
    const s = q.toLowerCase();
    return items.filter((i) => i.title.toLowerCase().includes(s));
  }, [items, q, usedMock]);

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-card border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <MessageSquare className="w-5 h-5" />
          <h1 className="text-xl font-semibold">채팅</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4 max-w-3xl">
        {error && (
          <div className="mb-4 p-3 text-sm rounded-md border border-destructive/30 text-destructive bg-destructive/10">
            {error}
          </div>
        )}

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="채팅방 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={usedMock} // 목업일 땐 검색 비활성화(1개 고정)
          />
        </div>

        <Separator className="mb-4" />

        {loading ? (
          <div className="text-sm text-muted-foreground">불러오는 중…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground">표시할 채팅방이 없습니다.</div>
        ) : (
          <div className="space-y-3">
            {filtered.map((c) => {
              const isMock = typeof c.id === "string" && c.id.startsWith("mock-");
              return (
                <Card
                  key={c.id}
                  className={`transition-shadow ${
                    isMock ? "opacity-90" : "hover:shadow-sm cursor-pointer"
                  }`}
                  onClick={() => {
                    if (!isMock) router.push(`/chats/${c.id}`);
                  }}
                >
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-medium truncate flex items-center gap-2">
                          <span className="truncate">{c.title}</span>
                          {isMock && <Badge variant="secondary">목업</Badge>}
                        </div>
                        <div className="text-sm text-muted-foreground truncate">
                          {c.lastMessage ?? "메시지가 없습니다."}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0">
                        {formatTime(c.lastAt)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {!loading && (
          <div className="mt-6">
            <Button variant="outline" onClick={() => location.reload()}>
              새로고침
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}