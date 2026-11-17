'use client';

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { fetchAdminSession } from "@/components/admin/admin-session-cache";
import { canAccessAdmin } from "@/components/admin/permission-check";
import { useAuth } from "@/hooks/use-auth";
import type { Permission } from "@/types/auth";

type AdminGuardProps = {
  children: React.ReactNode;
  permission?: Permission;
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

function persistAdminFlag(enabled: boolean): void {
  try {
    if (enabled) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, "true");
    } else {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {}
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
      persistAdminFlag(false);
      setAllowed(false);
      const query = window.location.search;
      const destination = `${pathname}${query ? `?${query}` : ""}`;
      router.replace(`/admin/login?redirect=${encodeURIComponent(destination)}`);
      return;
    }

    let active = true;

    // Si el usuario tiene el claim o correo de propietario verificado en Auth,
    // permitimos render inmediato y revalidamos la sesión del servidor en segundo plano.
    if (isAdmin) {
      setAllowed(true);
      persistAdminFlag(true);
    }

    void fetchAdminSession(user).then((result) => {
      if (!active) return;

      if (!result.ok) {
        if (result.status === 401 || result.status === 403) {
          persistAdminFlag(false);
          setAllowed(false);
          return;
        }
        const fallbackAccess = canAccessAdmin({ isAdmin, permissions: [], permission });
        setAllowed(fallbackAccess);
        persistAdminFlag(fallbackAccess);
        return;
      }

      const permissions = result.data.user?.permissions ?? [];
      const canAccess = canAccessAdmin({ isAdmin, permissions, permission });
      setAllowed(canAccess);
      persistAdminFlag(canAccess);
    });

    return () => {
      active = false;
    };
  }, [isAdmin, loading, pathname, permission, router, user]);

  if (allowed === true && user) {
    return children;
  }

  if (loading || !user || allowed === null) {
    return <AdminGuardSkeleton />;
  }

  return (
    <div className="mx-auto flex min-h-[40vh] max-w-xl items-center justify-center px-6 text-center text-sm text-slate-600">
      No tienes permisos para ver esta sección.
    </div>
  );
}
