'use client';

import { useEffect, useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { canAccessAdmin } from "@/components/admin/permission-check";
import type { Permission } from "@/types/auth";

type PermissionGateProps = {
  permission: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export function PermissionGate({ permission, children, fallback = null }: PermissionGateProps) {
  const { user, loading, isAdmin } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setAllowed(false);
      return;
    }

    if (isAdmin) {
      setAllowed(true);
      return;
    }

    let active = true;
    void user.getIdToken().then(async (token) => {
      const response = await fetch("/api/auth/session", { headers: { Authorization: `Bearer ${token}` } });
      if (!active) return;
      if (!response.ok) {
        setAllowed(canAccessAdmin({ isAdmin, permissions: [], permission }));
        return;
      }
      const data = (await response.json()) as { user?: { permissions?: Permission[] } };
      setAllowed(canAccessAdmin({ isAdmin, permissions: data.user?.permissions ?? [], permission }));
    }).catch(() => {
      if (active) setAllowed(canAccessAdmin({ isAdmin, permissions: [], permission }));
    });

    return () => {
      active = false;
    };
  }, [isAdmin, loading, permission, user]);

  if (loading || allowed === null) return null;
  return allowed ? children : fallback;
}
