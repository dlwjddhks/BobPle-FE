"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Users } from "lucide-react"
import { useRouter } from "next/navigation"

const mockChats = [
  {
    id: 1,
    eventTitle: "강남역 맛집 탐방",
    eventDate: "2024-01-20 19:00",
    lastMessage: {
      content: "네! 정말 기대됩니다. 이탈리안 음식 정말 좋아해요.",
      timestamp: "2024-01-19 16:00",
      senderName: "박준호",
    },
    participantCount: 3,
    unreadCount: 2,
    participants: [
      { name: "김민수", avatar: "/placeholder.svg?height=24&width=24" },
      { name: "이지은", avatar: "/placeholder.svg?height=24&width=24" },
      { name: "박준호", avatar: "/placeholder.svg?height=24&width=24" },
    ],
  },
  {
    id: 2,
    eventTitle: "홍대 브런치 모임",
    eventDate: "2024-01-21 11:30",
    lastMessage: {
      content: "브런치 카페 위치 공유드릴게요!",
      timestamp: "2024-01-19 18:30",
      senderName: "이지은",
    },
    participantCount: 4,
    unreadCount: 0,
    participants: [
      { name: "이지은", avatar: "/placeholder.svg?height=24&width=24" },
      { name: "김민수", avatar: "/placeholder.svg?height=24&width=24" },
      { name: "박준호", avatar: "/placeholder.svg?height=24&width=24" },
      { name: "최수진", avatar: "/placeholder.svg?height=24&width=24" },
    ],
  },
]

export default function ChatList() {
  const router = useRouter()
  const [chats] = useState(mockChats)

  const formatTime = (timestamp: string) => {
    const now = new Date()
    const messageTime = new Date(timestamp)
    const diffInHours = Math.abs(now.getTime() - messageTime.getTime()) / (1000 * 60 * 60)

    if (diffInHours < 24) {
      return messageTime.toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    } else {
      return messageTime.toLocaleDateString("ko-KR", {
        month: "short",
        day: "numeric",
      })
    }
  }

  return (
    <div className="space-y-3">
      {chats.map((chat) => (
        <Card
          key={chat.id}
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => router.push(`/chat/${chat.id}`)}
        >
          <CardContent className="p-4">
            <div className="flex items-start space-x-3">
              <div className="flex -space-x-2">
                {chat.participants.slice(0, 3).map((participant, index) => (
                  <Avatar key={index} className="w-10 h-10 border-2 border-background">
                    <AvatarImage src={participant.avatar || "/placeholder.svg"} />
                    <AvatarFallback>{participant.name[0]}</AvatarFallback>
                  </Avatar>
                ))}
                {chat.participants.length > 3 && (
                  <div className="w-10 h-10 rounded-full bg-muted border-2 border-background flex items-center justify-center">
                    <span className="text-xs font-medium">+{chat.participants.length - 3}</span>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-sm truncate">{chat.eventTitle}</h3>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-muted-foreground">{formatTime(chat.lastMessage.timestamp)}</span>
                    {chat.unreadCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="text-xs min-w-[20px] h-5 flex items-center justify-center"
                      >
                        {chat.unreadCount}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2 mb-2">
                  <Users className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{chat.participantCount}명</span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(chat.eventDate).toLocaleDateString("ko-KR", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>

                <p className="text-sm text-muted-foreground truncate">
                  <span className="font-medium">{chat.lastMessage.senderName}:</span> {chat.lastMessage.content}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
