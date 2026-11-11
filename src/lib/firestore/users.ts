import "server-only";

import { esEmailAdmin } from "@/lib/auth-claims";
import { AuthorizationError } from "@/lib/auth/verify-request";
import { getAdminDb } from "@/lib/firebase-admin";
import { writeAuditInTransaction, createAuditEntry } from "@/lib/firestore/audit";
import { profileUpdateSchema, type ProfileUpdateInput } from "@/lib/validation/account";
import type { AccountType, AuthProfile, UserProfile } from "@/types/auth";

const accountTypes = new Set<AccountType>(["customer", "staff", "admin"]);

function toProfile(uid: string, data: Record<string, unknown>): UserProfile {
  return {
    uid,
    email: typeof data.email === "string" ? data.email : "",
    displayName: typeof data.displayName === "string" ? data.displayName : null,
    photoURL: typeof data.photoURL === "string" ? data.photoURL : null,
    telefono: typeof data.telefono === "string" ? data.telefono : null,
    addresses: Array.isArray(data.addresses) ? data.addresses : [],
    active: data.active !== false,
    accountType: accountTypes.has(data.accountType as AccountType) ? (data.accountType as AccountType) : "customer",
    roleIds: Array.isArray(data.roleIds) ? data.roleIds.filter((role): role is string => typeof role === "string") : ["customer"],
    permissions: Array.isArray(data.permissions) ? data.permissions.filter((permission): permission is `${string}.${string}` => typeof permission === "string") : [],
    createdAt: (data.createdAt as UserProfile["createdAt"]) ?? new Date().toISOString(),
    lastLoginAt: (data.lastLoginAt as UserProfile["lastLoginAt"]) ?? new Date().toISOString(),
  };
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snapshot = await getAdminDb().collection("users").doc(uid).get();
  return snapshot.exists ? toProfile(uid, (snapshot.data() ?? {}) as Record<string, unknown>) : null;
}

export async function syncUser(uid: string, data: AuthProfile): Promise<UserProfile> {
  const ref = getAdminDb().collection("users").doc(uid);
  const existing = await ref.get();
  const current = existing.exists ? toProfile(uid, (existing.data() ?? {}) as Record<string, unknown>) : null;
  if (current && !current.active) {
    throw new AuthorizationError(401, "La cuenta está inactiva");
  }
  const now = new Date().toISOString();
  const profile: UserProfile = {
    uid,
    email: data.email,
    displayName: data.displayName,
    photoURL: data.photoURL,
    telefono: current?.telefono ?? null,
    addresses: current?.addresses ?? [],
    active: current?.active ?? true,
    accountType: (esEmailAdmin(data.email) && data.emailVerified === true) ? "admin" : (current?.accountType ?? "customer"),
    roleIds: (esEmailAdmin(data.email) && data.emailVerified === true) ? ["admin"] : (current?.roleIds?.length ? current.roleIds : ["customer"]),
    permissions: current?.permissions ?? [],
    createdAt: current?.createdAt ?? now,
    lastLoginAt: now,
  };

  await ref.set(profile, { merge: true });
  return profile;
}

export async function listUsers(): Promise<UserProfile[]> {
  const snapshot = await getAdminDb().collection("users").get();
  return snapshot.docs.map((doc) => toProfile(doc.id, (doc.data() ?? {}) as Record<string, unknown>));
}

export async function updateUser(uid: string, input: { active?: boolean; roleIds?: string[] }, actorUid = "system"): Promise<void> {
  if (uid === actorUid && input.active === false) {
    throw new AuthorizationError(409, "No puedes desactivar tu propia cuenta administrativa");
  }
  if (uid === actorUid && input.roleIds !== undefined) {
    throw new AuthorizationError(409, "No puedes cambiar tus propios roles administrativos");
  }
  const updates: { active?: boolean; roleIds?: string[] } = {};
  if (input.active !== undefined) updates.active = input.active;
  if (input.roleIds !== undefined) updates.roleIds = input.roleIds;
  const db = getAdminDb();
  if (input.roleIds !== undefined) {
    const roleSnapshots = await Promise.all(input.roleIds.map((roleId) => db.collection("roles").doc(roleId).get()));
    if (roleSnapshots.some((snapshot) => !snapshot.exists)) throw new Error("Los roles seleccionados no existen");
  }
  const ref = db.collection("users").doc(uid);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (!existing.exists) throw new Error("Usuario no encontrado");
    transaction.update(ref, updates);
    writeAuditInTransaction(transaction, {
      actorUid,
      action: "update",
      module: "usuarios",
      entityId: uid,
      changes: input,
    });
  });
}

export async function auditUserMutation(actorUid: string, uid: string, changes: Record<string, unknown>): Promise<void> {
  await createAuditEntry({ actorUid, action: "update", module: "usuarios", entityId: uid, changes });
}

export async function updateUserProfile(uid: string, input: ProfileUpdateInput): Promise<UserProfile> {
  const updates = profileUpdateSchema.parse(input);
  const db = getAdminDb();
  const ref = db.collection("users").doc(uid);
  let updatedProfile: UserProfile | undefined;

  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (!existing.exists) throw new Error("El perfil de usuario no está disponible");

    const current = toProfile(uid, (existing.data() ?? {}) as Record<string, unknown>);
    transaction.update(ref, updates);
    writeAuditInTransaction(transaction, {
      actorUid: uid,
      action: "update",
      module: "usuarios",
      entityId: uid,
      changes: { fields: Object.keys(updates) },
    });
    updatedProfile = { ...current, ...updates };
  });

  if (!updatedProfile) throw new Error("No fue posible actualizar el perfil");
  return updatedProfile;
}
