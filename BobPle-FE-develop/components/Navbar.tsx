// src/components/Navbar.tsx
import LogoutButton from '@/features/auth/LogoutButton';

export default function Navbar() {
  return (
    <nav className="flex items-center justify-between px-4 py-2 bg-gray-100">
      <h1 className="text-xl font-bold">BobPle</h1>
      <LogoutButton />
    </nav>
  );
}