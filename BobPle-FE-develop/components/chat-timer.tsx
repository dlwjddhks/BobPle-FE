"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Clock, AlertTriangle } from "lucide-react"

interface ChatTimerProps {
  eventEndTime: string
  onExpired: () => void
}

export function ChatTimer({ eventEndTime, onExpired }: ChatTimerProps) {
  const [timeLeft, setTimeLeft] = useState<string>("")
  const [isExpired, setIsExpired] = useState(false)
  const [isNearExpiry, setIsNearExpiry] = useState(false)

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date().getTime()
      const endTime = new Date(eventEndTime).getTime()
      const difference = endTime - now

      if (difference <= 0) {
        setTimeLeft("종료됨")
        setIsExpired(true)
        onExpired()
        return
      }

      const hours = Math.floor(difference / (1000 * 60 * 60))
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60))

      if (hours > 0) {
        setTimeLeft(`${hours}시간 ${minutes}분 후 종료`)
      } else {
        setTimeLeft(`${minutes}분 후 종료`)
      }

      // 30분 이하일 때 경고 표시
      setIsNearExpiry(difference <= 30 * 60 * 1000)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 60000) // 1분마다 업데이트

    return () => clearInterval(interval)
  }, [eventEndTime, onExpired])

  if (isExpired) {
    return (
      <Badge variant="destructive" className="text-xs">
        <AlertTriangle className="w-3 h-3 mr-1" />
        채팅방 종료
      </Badge>
    )
  }

  return (
    <Badge variant={isNearExpiry ? "destructive" : "secondary"} className="text-xs">
      <Clock className="w-3 h-3 mr-1" />
      {timeLeft}
    </Badge>
  )
}
