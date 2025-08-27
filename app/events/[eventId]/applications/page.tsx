"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ArrowLeft, Check, X, MessageCircle, Star } from "lucide-react"
import { useRouter, useParams } from "next/navigation"
import { useNotifications } from "@/components/notification-context"

interface Application {
  id: string
  user: {
    id: string
    name: string
    avatar: string
    rating: number
    reviewCount: number
  }
  message?: string
  appliedAt: string
  status: "pending" | "approved" | "rejected"
}

const mockApplications: Application[] = [
  {
    id: "app-1",
    user: {
      id: "user-3",
      name: "박준호",
      avatar: "/placeholder.svg?height=40&width=40",
      rating: 4.7,
      reviewCount: 15,
    },
    message: "이탈리안 음식을 정말 좋아해서 꼭 참여하고 싶습니다!",
    appliedAt: "2024-01-19T14:30:00Z",
    status: "pending",
  },
  {
    id: "app-2",
    user: {
      id: "user-4",
      name: "최수진",
      avatar: "/placeholder.svg?height=40&width=40",
      rating: 4.9,
      reviewCount: 28,
    },
    message: "새로운 사람들과 맛있는 음식을 함께 나누고 싶어요.",
    appliedAt: "2024-01-19T16:45:00Z",
    status: "pending",
  },
  {
    id: "app-3",
    user: {
      id: "user-5",
      name: "정민호",
      avatar: "/placeholder.svg?height=40&width=40",
      rating: 4.6,
      reviewCount: 12,
    },
    appliedAt: "2024-01-19T18:20:00Z",
    status: "approved",
  },
]

export default function ApplicationsPage() {
  const router = useRouter()
  const params = useParams()
  const { addNotification } = useNotifications()
  const [applications, setApplications] = useState(mockApplications)

  const handleApprove = async (applicationId: string) => {
    try {
      // Mock API call - replace with actual API call
      console.log("Approving application:", applicationId)
      await new Promise((resolve) => setTimeout(resolve, 500))

      const application = applications.find((app) => app.id === applicationId)
      if (!application) return

      setApplications((prev) =>
        prev.map((app) => (app.id === applicationId ? { ...app, status: "approved" as const } : app)),
      )

      addNotification({
        type: "application_approved",
        title: "참여 신청이 승인되었습니다!",
        message: `강남역 맛집 탐방 밥약에 참여가 승인되었습니다. 채팅방에 입장하여 다른 참여자들과 대화해보세요.`,
        actionData: {
          eventId: params.eventId as string,
          chatId: `chat-${params.eventId}`,
        },
      })

      console.log(`Auto-joining user ${application.user.id} to chat room chat-${params.eventId}`)
    } catch (error) {
      console.error("Failed to approve application:", error)
    }
  }

  const handleReject = async (applicationId: string) => {
    try {
      // Mock API call - replace with actual API call
      console.log("Rejecting application:", applicationId)
      await new Promise((resolve) => setTimeout(resolve, 500))

      setApplications((prev) =>
        prev.map((app) => (app.id === applicationId ? { ...app, status: "rejected" as const } : app)),
      )
    } catch (error) {
      console.error("Failed to reject application:", error)
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const pendingApplications = applications.filter((app) => app.status === "pending")
  const processedApplications = applications.filter((app) => app.status !== "pending")

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold">참여 신청 관리</h1>
              <p className="text-sm text-muted-foreground">대기 중인 신청 {pendingApplications.length}개</p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-2xl">
        {/* Pending Applications */}
        {pendingApplications.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                대기 중인 신청
                <Badge variant="secondary" className="ml-2">
                  {pendingApplications.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {pendingApplications.map((application) => (
                  <div key={application.id} className="border rounded-lg p-4">
                    <div className="flex items-start space-x-3">
                      <Avatar
                        className="w-12 h-12 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => router.push(`/profile/${application.user.id}`)}
                      >
                        <AvatarImage src={application.user.avatar || "/placeholder.svg"} />
                        <AvatarFallback>{application.user.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <h3
                              className="font-medium cursor-pointer hover:text-primary transition-colors"
                              onClick={() => router.push(`/profile/${application.user.id}`)}
                            >
                              {application.user.name}
                            </h3>
                            <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                              <Star className="w-3 h-3 fill-current text-yellow-500" />
                              <span>{application.user.rating}</span>
                              <span>({application.user.reviewCount}개 리뷰)</span>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatTimestamp(application.appliedAt)}
                          </span>
                        </div>
                        {application.message && (
                          <p className="text-sm text-muted-foreground mb-3 bg-muted/50 p-2 rounded">
                            "{application.message}"
                          </p>
                        )}
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleApprove(application.id)} className="flex-1">
                            <Check className="w-4 h-4 mr-1" />
                            승인
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReject(application.id)}
                            className="flex-1 bg-transparent"
                          >
                            <X className="w-4 h-4 mr-1" />
                            거절
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => router.push(`/profile/${application.user.id}`)}
                          >
                            프로필
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Processed Applications */}
        {processedApplications.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">처리된 신청</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {processedApplications.map((application) => (
                  <div key={application.id} className="flex items-center space-x-3 p-3 rounded-lg bg-muted/30">
                    <Avatar
                      className="w-10 h-10 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => router.push(`/profile/${application.user.id}`)}
                    >
                      <AvatarImage src={application.user.avatar || "/placeholder.svg"} />
                      <AvatarFallback>{application.user.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <span
                            className="font-medium cursor-pointer hover:text-primary transition-colors"
                            onClick={() => router.push(`/profile/${application.user.id}`)}
                          >
                            {application.user.name}
                          </span>
                          <div className="flex items-center space-x-2">
                            <Badge
                              variant={application.status === "approved" ? "default" : "destructive"}
                              className="text-xs"
                            >
                              {application.status === "approved" ? "승인됨" : "거절됨"}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(application.appliedAt)}
                            </span>
                          </div>
                        </div>
                        {application.status === "approved" && (
                          <Button size="sm" variant="ghost" onClick={() => router.push(`/chat/${params.eventId}`)}>
                            <MessageCircle className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {applications.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg">아직 참여 신청이 없습니다.</p>
            <p className="text-muted-foreground">신청이 들어오면 여기에 표시됩니다.</p>
          </div>
        )}
      </div>
    </div>
  )
}
