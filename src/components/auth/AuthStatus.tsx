'use client';

import Link from 'next/link';
import { LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { logout } from '@/lib/auth-client';

export function AuthStatus({ mobileMenu = false }: { mobileMenu?: boolean }) {
  const { user, loading, isAdmin } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (loading) {
    return <div className="hidden h-9 w-20 animate-pulse rounded-full bg-muted sm:block" aria-label="Cargando sesión" />;
  }

  if (!user) {
    return (
      <div className="flex items-center gap-1 sm:gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/login">Ingresar</Link>
        </Button>
        <Button size="sm" className="px-2 text-xs sm:px-3" asChild>
          <Link href="/registro">Crear cuenta</Link>
        </Button>
      </div>
    );
  }

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (mobileMenu) {
    return (
      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <Link href="/cuenta" className="flex items-center gap-2 text-sm font-medium text-primary hover:text-accent transition-colors">
          <UserRound className="h-5 w-5" />
          Mi cuenta
        </Link>
        {isAdmin && (
          <Link href="/admin/dashboard" className="flex items-center gap-2 text-sm font-bold text-cyan-400 hover:text-cyan-300 transition-colors bg-cyan-950/40 p-2.5 rounded-xl border border-cyan-500/30">
            <ShieldCheck className="h-5 w-5 text-cyan-400" />
            <span>Panel Staff & Administración</span>
          </Link>
        )}
        <Button variant="ghost" size="sm" className="justify-start gap-2 px-0 text-sm font-medium" disabled={isLoggingOut} onClick={handleLogout}>
          <LogOut className="h-5 w-5" />
          Cerrar sesión
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <Button variant="ghost" size="sm" className="hidden max-w-[130px] items-center gap-1 truncate sm:inline-flex" asChild>
        <Link href="/cuenta" title={user.displayName ?? user.email ?? 'Mi cuenta'}>
          <UserRound className="h-4 w-4 shrink-0" />
          <span className="truncate">{user.displayName ?? 'Mi cuenta'}</span>
        </Link>
      </Button>
      {isAdmin && (
        <Button
          variant="outline"
          size="sm"
          asChild
          className="border-cyan-500/40 bg-cyan-950/30 text-cyan-300 hover:bg-cyan-900/40 hover:text-cyan-200 text-xs font-bold gap-1.5 shadow-sm shadow-cyan-500/20"
          title="Panel Staff y Operaciones"
        >
          <Link href="/admin/dashboard" aria-label="Panel de administración">
            <ShieldCheck className="h-4 w-4 text-cyan-400" />
            <span className="hidden sm:inline">Panel Staff</span>
          </Link>
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        disabled={isLoggingOut}
        onClick={handleLogout}
        title="Cerrar sesión"
        aria-label="Cerrar sesión"
      >
        <LogOut className="h-5 w-5" />
      </Button>
    </div>
  );
}
