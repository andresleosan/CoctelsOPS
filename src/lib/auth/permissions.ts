import "server-only";

import type { NextRequest } from "next/server";

import { esEmailAdmin, esTokenAdminVerificado } from "@/lib/auth-claims";
import { getAdminDb } from "@/lib/firebase-admin";
import { DEFAULT_TENANT_ID } from "@/types/tenant";
import {
  ALL_ADMIN_PERMISSIONS,
  type AdminAccessDiagnostic,
  type Permission,
  type Role,
  type UserProfile,
  type VerifiedUser,
} from "@/types/auth";
import { AuthorizationError, verifyRequest } from "@/lib/auth/verify-request";

function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && /^[^.]+\.[^.]+$/.test(value);
}

export async function resolvePermissions(user: UserProfile): Promise<Permission[]> {
  if (user.accountType === "admin") {
    return [];
  }

  const roles = await Promise.all(
    user.roleIds.map(async (roleId) => {
      const snapshot = await getAdminDb().collection("roles").doc(roleId).get();
      if (!snapshot.exists) return null;
      const role = snapshot.data() as Role | undefined;
      return role?.active ? role : null;
    }),
  );

  return [...new Set(roles.flatMap((role) => role?.permissions ?? []).filter(isPermission))];
}

export function hasPermission(user: UserProfile, permission: Permission): boolean {
  return user.active && (user.accountType === "admin" || user.permissions?.includes(permission) === true);
}

export async function requirePermission(request: NextRequest, permission: Permission): Promise<VerifiedUser> {
  const verified = await verifyRequest(request);
  const permissions = await resolvePermissions(verified.profile);
  const profile = { ...verified.profile, permissions };
  const isOwnerAdmin = esTokenAdminVerificado(verified.token);
  const hasAdminClaim = isOwnerAdmin && profile.accountType === "admin";
  const hasRolePermission = profile.accountType !== "admin" && permissions.includes(permission);

  if (!hasAdminClaim && !hasRolePermission) {
    throw new AuthorizationError(403, "No tienes permiso para realizar esta acción");
  }

  return { ...verified, profile, permissions };
}

export function isUserOwner(user: VerifiedUser, uid: string): boolean {
  return user.uid === uid;
}

export function requireUserOwnership(user: VerifiedUser, uid: string): void {
  if (!isUserOwner(user, uid)) {
    throw new AuthorizationError(403, "No tienes permiso para acceder a este usuario");
  }
}

export function isGlobalAdmin(user: VerifiedUser): boolean {
  return Boolean(
    user.profile.active &&
      esTokenAdminVerificado(user.token) &&
      user.profile.accountType === "admin",
  );
}

export function buildAdminAccessDiagnostic(
  verified: VerifiedUser,
  resolvedPermissions: Permission[],
): AdminAccessDiagnostic {
  const isAdmin = isGlobalAdmin(verified);
  return {
    isAdmin,
    hasCustomClaim: verified.token.admin === true,
    isOwnerEmail: esEmailAdmin(verified.token.email),
    emailVerified: verified.token.email_verified === true,
    accountType: verified.profile.accountType,
    active: verified.profile.active,
    effectivePermissions: isAdmin ? [...ALL_ADMIN_PERMISSIONS] : resolvedPermissions,
  };
}

export function hasNegocioAccess(user: VerifiedUser, negocioId: string): boolean {
  const target = negocioId.trim();
  if (!target) return false;
  if (isGlobalAdmin(user)) return true;
  return Boolean(user.profile.active && user.profile.negocioId?.trim() === target);
}

export function requireNegocioAccess(user: VerifiedUser, negocioId: string): void {
  if (!hasNegocioAccess(user, negocioId)) {
    throw new AuthorizationError(403, "No tienes permiso para acceder a este negocio");
  }
}

export function resolveAuthorizedNegocioId(
  user: VerifiedUser,
  requestedNegocioId?: string | null,
): string {
  const target = requestedNegocioId?.trim() || user.profile.negocioId?.trim() || DEFAULT_TENANT_ID;
  requireNegocioAccess(user, target);
  return target;
}
