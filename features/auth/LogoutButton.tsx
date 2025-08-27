'use client';

import { Button } from '@/components/ui/button';
import { postLogout } from '@/features/auth/auth.repository';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/shared/lib/firebase';
import { useState } from 'react';

console.log('[FB]', (process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '').slice(0,5));

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    if (loading) return;
    setLoading(true);
    try {
      // 1) 백엔드 세션 끊기 (쿠키 없으면 4xx/5xx 가능)
      await postLogout();
    } catch (e) {
      console.warn('[logout] server error ignored:', e);
    } finally {
      // 2) 클라이언트 정리: Firebase 세션/캐시 제거
      localStorage.removeItem('isLoggedIn');
      localStorage.removeItem('userEmail');
      // 3) 앱 상태도 초기화 필요하면 이곳에서 localStorage 등 제거
      // localStorage.removeItem('something')

      // 4) 어쨌든 로그인 화면으로
      router.replace('/login');
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" onClick={handleLogout} disabled={loading}>
      {loading ? '로그아웃 중…' : '로그아웃'}
    </Button>
  );
}