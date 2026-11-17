'use client';

import { useEffect, useState } from "react";

import { fetchAdminSession } from "@/components/admin/admin-session-cache";
import { canAccessAdmin } from "@/components/admin/permission-check";
import { useAuth } from "@/hooks/use-auth";
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
    void fetchAdminSession(user).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setAllowed(canAccessAdmin({ isAdmin, permissions: [], permission }));
        return;
      }
      const permissions = result.data.user?.permissions ?? [];
      setAllowed(canAccessAdmin({ isAdmin, permissions, permission }));
    });

    return () => {
      active = false;
    };
  }, [isAdmin, loading, permission, user]);

  if (loading || allowed === null) return null;
  return allowed ? children : fallback;
}
