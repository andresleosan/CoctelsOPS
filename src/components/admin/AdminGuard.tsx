'use client';

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { canAccessAdmin } from "@/components/admin/permission-check";
import type { Permission } from "@/types/auth";

type AdminGuardProps = {
  children: React.ReactNode;
  permission?: Permission;
};

type SessionResponse = {
  user?: { permissions?: Permission[] };
};

export function AdminGuard({ children, permission }: AdminGuardProps) {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      const query = window.location.search;
      const destination = `${pathname}${query ? `?${query}` : ""}`;
      router.replace(`/admin/login?redirect=${encodeURIComponent(destination)}`);
      return;
    }

    // Si el usuario ya tiene la custom claim de admin en su token verificado de Firebase Auth
    if (isAdmin && !permission) {
      setAllowed(true);
      return;
    }

    let active = true;
    setAllowed(null);
    void user.getIdToken().then(async (token) => {
      const response = await fetch("/api/auth/session", { headers: { Authorization: `Bearer ${token}` } });
      if (!active) return;
      if (!response.ok) {
        setAllowed(canAccessAdmin({ isAdmin, permissions: [], permission }));
        return;
      }
      const data = (await response.json()) as SessionResponse;
      const permissions = data.user?.permissions ?? [];
      setAllowed(canAccessAdmin({ isAdmin, permissions, permission }));
    }).catch(() => {
      if (active) setAllowed(canAccessAdmin({ isAdmin, permissions: [], permission }));
    });

    return () => {
      active = false;
    };
  }, [isAdmin, loading, pathname, permission, router, user]);

  if (loading || !user || allowed === null) {
    return <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">Validando acceso...</div>;
  }

  if (!allowed) {
    return <div className="mx-auto flex min-h-[40vh] max-w-xl items-center justify-center px-6 text-center text-sm text-muted-foreground">No tienes permisos para ver esta sección.</div>;
  }

  return children;
}
