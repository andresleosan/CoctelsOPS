import "server-only";

import type { NextRequest } from "next/server";

import { esEmailAdmin } from "@/lib/auth-claims";
import { getAdminDb } from "@/lib/firebase-admin";
import type { Permission, Role, UserProfile, VerifiedUser } from "@/types/auth";
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
  const isOwnerAdmin =
    verified.token.admin === true ||
    (esEmailAdmin(verified.token.email) && verified.token.email_verified === true);
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
  const isOwnerAdmin =
    user.token.admin === true ||
    (esEmailAdmin(user.token.email) && user.token.email_verified === true);
  return Boolean(isOwnerAdmin && user.profile.accountType === "admin");
}

export function hasNegocioAccess(user: VerifiedUser, negocioId: string): boolean {
  if (isGlobalAdmin(user)) return true;
  return Boolean(user.profile.active && user.profile.negocioId === negocioId);
}

export function requireNegocioAccess(user: VerifiedUser, negocioId: string): void {
  if (!hasNegocioAccess(user, negocioId)) {
    throw new AuthorizationError(403, "No tienes permiso para acceder a este negocio");
  }
}
