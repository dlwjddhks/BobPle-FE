"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

/**
 * 알림 데이터 인터페이스
 * 앱 내에서 사용되는 모든 알림의 구조를 정의
 */
interface Notification {
  id: string // 고유 식별자
  type: "application_approved" | "review_request" | "chat_message" | "event_reminder" // 알림 타입
  title: string // 알림 제목
  message: string // 알림 내용
  timestamp: string // 생성 시간 (ISO 형식)
  isRead: boolean // 읽음 여부
  actionData?: {
    // 알림 클릭 시 필요한 추가 데이터
    eventId?: string // 밥약 ID
    userId?: string // 사용자 ID
    chatId?: string // 채팅방 ID
  }
}

/**
 * 알림 Context 타입 정의
 * 알림 관련 상태와 함수들을 포함
 */
interface NotificationContextType {
  notifications: Notification[] // 전체 알림 목록
  unreadCount: number // 읽지 않은 알림 개수
  addNotification: (notification: Omit<Notification, "id" | "timestamp" | "isRead">) => void // 새 알림 추가
  markAsRead: (id: string) => void // 특정 알림을 읽음으로 표시
  markAllAsRead: () => void // 모든 알림을 읽음으로 표시
  deleteNotification: (id: string) => void // 특정 알림 삭제
}

// 알림 Context 생성
const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

/**
 * 알림 Provider 컴포넌트
 * 앱 전체에서 알림 상태를 관리하고 공유하는 Context Provider
 * @param children 하위 컴포넌트들
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]) // 알림 목록 상태

  /**
   * 새 알림 추가 함수
   * 자동으로 ID, 타임스탬프, 읽음 상태를 설정하여 알림을 생성
   * @param notification 알림 데이터 (ID, 타임스탬프, 읽음 상태 제외)
   */
  const addNotification = (notification: Omit<Notification, "id" | "timestamp" | "isRead">) => {
    const newNotification: Notification = {
      ...notification,
      id: Date.now().toString(), // 현재 시간을 ID로 사용
      timestamp: new Date().toISOString(), // ISO 형식의 현재 시간
      isRead: false, // 새 알림은 기본적으로 읽지 않음 상태
    }
    // 새 알림을 목록 맨 앞에 추가 (최신 순 정렬)
    setNotifications((prev) => [newNotification, ...prev])
  }

  /**
   * 특정 알림을 읽음으로 표시하는 함수
   * @param id 읽음으로 표시할 알림의 ID
   */
  const markAsRead = (id: string) => {
    setNotifications((prev) => prev.map((notif) => (notif.id === id ? { ...notif, isRead: true } : notif)))
  }

  /**
   * 모든 알림을 읽음으로 표시하는 함수
   * 알림 페이지에서 "모두 읽음" 기능에 사용
   */
  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((notif) => ({ ...notif, isRead: true })))
  }

  /**
   * 특정 알림을 삭제하는 함수
   * @param id 삭제할 알림의 ID
   */
  const deleteNotification = (id: string) => {
    setNotifications((prev) => prev.filter((notif) => notif.id !== id))
  }

  // 읽지 않은 알림 개수 계산 (헤더 배지 표시용)
  const unreadCount = notifications.filter((n) => !n.isRead).length

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        deleteNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

/**
 * 알림 Context를 사용하기 위한 커스텀 훅
 * 컴포넌트에서 알림 관련 상태와 함수에 접근할 때 사용
 * @returns NotificationContextType 알림 Context 값
 * @throws Error Provider 외부에서 사용 시 에러 발생
 */
export function useNotifications() {
  const context = useContext(NotificationContext)
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationProvider")
  }
  return context
}
