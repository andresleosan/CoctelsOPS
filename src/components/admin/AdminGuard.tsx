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

const SESSION_STORAGE_KEY = "coctels_admin_authenticated";

function getInitialAllowed(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY) === "true" ? true : null;
  } catch {
    return null;
  }
}

export function AdminGuardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse p-2" aria-label="Cargando sección">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-lg bg-slate-200" />
          <div className="h-4 w-72 rounded bg-slate-200/70" />
        </div>
        <div className="h-9 w-28 rounded-lg bg-slate-200" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="h-24 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" />
        <div className="h-24 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" />
        <div className="h-24 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" />
        <div className="h-24 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" />
      </div>

      <div className="h-64 rounded-xl border border-slate-200 bg-white p-6 shadow-sm" />
    </div>
  );
}

export function AdminGuard({ children, permission }: AdminGuardProps) {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [allowed, setAllowed] = useState<boolean | null>(() => getInitialAllowed());

  useEffect(() => {
    if (loading) return;

    if (!user) {
      try {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      } catch {}
      const query = window.location.search;
      const destination = `${pathname}${query ? `?${query}` : ""}`;
      router.replace(`/admin/login?redirect=${encodeURIComponent(destination)}`);
      return;
    }

    // Si el usuario ya tiene la custom claim de admin en su token verificado de Firebase Auth
    if (isAdmin) {
      setAllowed(true);
      try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, "true");
      } catch {}
      return;
    }

    let active = true;
    void user.getIdToken().then(async (token) => {
      const response = await fetch("/api/auth/session", { headers: { Authorization: `Bearer ${token}` } });
      if (!active) return;
      if (!response.ok) {
        const canAccess = canAccessAdmin({ isAdmin, permissions: [], permission });
        setAllowed(canAccess);
        if (canAccess) {
          try { sessionStorage.setItem(SESSION_STORAGE_KEY, "true"); } catch {}
        }
        return;
      }
      const data = (await response.json()) as SessionResponse;
      const permissions = data.user?.permissions ?? [];
      const canAccess = canAccessAdmin({ isAdmin, permissions, permission });
      setAllowed(canAccess);
      if (canAccess) {
        try { sessionStorage.setItem(SESSION_STORAGE_KEY, "true"); } catch {}
      }
    }).catch(() => {
      if (active) {
        const canAccess = canAccessAdmin({ isAdmin, permissions: [], permission });
        setAllowed(canAccess);
      }
    });

    return () => {
      active = false;
    };
  }, [isAdmin, loading, pathname, permission, router, user]);

  if (allowed === true) {
    return children;
  }

  if (loading || !user || allowed === null) {
    return <AdminGuardSkeleton />;
  }

  return (
    <div className="mx-auto flex min-h-[40vh] max-w-xl items-center justify-center px-6 text-center text-sm text-muted-foreground">
      No tienes permisos para ver esta sección.
    </div>
  );
}
