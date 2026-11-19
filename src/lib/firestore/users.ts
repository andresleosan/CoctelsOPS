import "server-only";

import { esEmailAdmin } from "@/lib/auth-claims";
import { AuthorizationError } from "@/lib/auth/verify-request";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { writeAuditInTransaction, createAuditEntry } from "@/lib/firestore/audit";
import { profileUpdateSchema, type ProfileUpdateInput } from "@/lib/validation/account";
import type { AccountType, AuthProfile, UserProfile } from "@/types/auth";

export class AdminUserValidationError extends Error {
  readonly status = 422;

  constructor(message: string) {
    super(message);
    this.name = "AdminUserValidationError";
  }
}

export class UserNotFoundError extends Error {
  readonly status = 404;

  constructor(message = "Usuario no encontrado") {
    super(message);
    this.name = "UserNotFoundError";
  }
}

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
    if (!existing.exists) throw new UserNotFoundError("Usuario no encontrado");
    const current = toProfile(uid, (existing.data() ?? {}) as Record<string, unknown>);
    if (input.active === false) {
      if (esEmailAdmin(current.email)) {
        throw new AuthorizationError(409, "No puedes desactivar al propietario principal");
      }
      if (current.accountType === "admin") {
        const usersCollection = db.collection("users");
        if (typeof usersCollection.where === "function") {
          const adminsSnap = await transaction.get(usersCollection.where("accountType", "==", "admin"));
          const activeAdmins = adminsSnap.docs.filter((doc) => doc.data()?.active !== false);
          if (activeAdmins.length <= 1 && activeAdmins.some((doc) => doc.id === uid)) {
            throw new AuthorizationError(409, "Debe permanecer al menos un administrador activo en el sistema");
          }
        }
      }
    }
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

export async function setUserAdminStatus(
  uid: string,
  makeAdmin: boolean,
  actorUid: string,
  nextNonAdminType: "staff" | "customer" = "staff",
): Promise<UserProfile> {
  if (uid === actorUid) {
    throw new AuthorizationError(409, "No puedes modificar tu propio nivel administrativo");
  }

  const db = getAdminDb();
  const ref = db.collection("users").doc(uid);
  let updatedProfile: UserProfile | undefined;

  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (!existing.exists) throw new UserNotFoundError("Usuario no encontrado");

    const current = toProfile(uid, (existing.data() ?? {}) as Record<string, unknown>);
    if (!makeAdmin) {
      if (esEmailAdmin(current.email)) {
        throw new AuthorizationError(409, "No puedes revocar al propietario principal");
      }
      if (current.accountType === "admin") {
        const usersCollection = db.collection("users");
        if (typeof usersCollection.where === "function") {
          const adminsSnap = await transaction.get(usersCollection.where("accountType", "==", "admin"));
          const activeAdmins = adminsSnap.docs.filter((doc) => doc.data()?.active !== false);
          if (activeAdmins.length <= 1 && activeAdmins.some((doc) => doc.id === uid)) {
            throw new AuthorizationError(409, "Debe permanecer al menos un administrador activo en el sistema");
          }
        }
      }
    }

    const nextAccountType: AccountType = makeAdmin ? "admin" : nextNonAdminType;
    const withoutAdmin = current.roleIds.filter((roleId) => roleId !== "admin");
    const nextRoleIds = makeAdmin
      ? ["admin"]
      : withoutAdmin.length > 0
        ? withoutAdmin
        : nextNonAdminType === "customer"
          ? ["customer"]
          : [];

    const updates: Partial<UserProfile> = {
      accountType: nextAccountType,
      roleIds: nextRoleIds,
      ...(makeAdmin ? { active: true } : {}),
    };

    transaction.update(ref, updates);
    writeAuditInTransaction(transaction, {
      actorUid,
      action: "update",
      module: "usuarios",
      entityId: uid,
      changes: { accountType: nextAccountType, roleIds: nextRoleIds, admin: makeAdmin },
    });

    updatedProfile = { ...current, ...updates };
  });

  if (!updatedProfile) {
    throw new Error("No fue posible actualizar el nivel administrativo");
  }

  const auth = getAdminAuth();
  const authUser = await auth.getUser(uid);
  const existingClaims = (authUser.customClaims ?? {}) as Record<string, unknown>;
  await auth.setCustomUserClaims(uid, { ...existingClaims, admin: makeAdmin });

  return updatedProfile;
}

function isAuthUserNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === "auth/user-not-found") return true;
  if (typeof candidate.message === "string") {
    return (
      candidate.message.includes("user-not-found") ||
      candidate.message.includes("no user record")
    );
  }
  return false;
}

export async function addAdministratorByEmail(
  input: { email: string; displayName?: string; password?: string },
  actorUid: string,
): Promise<{ user: UserProfile; createdAuthUser: boolean }> {
  const email = input.email.trim().toLowerCase();
  if (!email) {
    throw new AdminUserValidationError("El correo electrónico es obligatorio");
  }

  const auth = getAdminAuth();
  let authUser: Awaited<ReturnType<typeof auth.getUserByEmail>>;
  let createdAuthUser = false;

  try {
    authUser = await auth.getUserByEmail(email);
  } catch (lookupError) {
    if (!isAuthUserNotFoundError(lookupError)) {
      throw lookupError;
    }

    const cleanPassword = input.password?.trim() ?? "";
    if (cleanPassword.length < 8) {
      throw new AdminUserValidationError(
        "Ese correo aún no tiene cuenta. Ingresa una contraseña temporal (mín. 8 caracteres) para crearla.",
      );
    }

    const cleanDisplayName = input.displayName?.trim();
    authUser = await auth.createUser({
      email,
      password: cleanPassword,
      ...(cleanDisplayName ? { displayName: cleanDisplayName } : {}),
      emailVerified: true,
    });
    createdAuthUser = true;
  }

  const existingClaims = (authUser.customClaims ?? {}) as Record<string, unknown>;
  await auth.setCustomUserClaims(authUser.uid, { ...existingClaims, admin: true });

  const db = getAdminDb();
  const ref = db.collection("users").doc(authUser.uid);
  const existingSnap = await ref.get();
  const existingProfile = existingSnap.exists
    ? toProfile(authUser.uid, (existingSnap.data() ?? {}) as Record<string, unknown>)
    : null;

  const now = new Date().toISOString();
  const cleanName = input.displayName?.trim();
  const profile: UserProfile = {
    uid: authUser.uid,
    email,
    displayName: cleanName || existingProfile?.displayName || authUser.displayName || null,
    photoURL: existingProfile?.photoURL ?? authUser.photoURL ?? null,
    telefono: existingProfile?.telefono ?? null,
    addresses: existingProfile?.addresses ?? [],
    active: true,
    accountType: "admin",
    roleIds: ["admin"],
    permissions: [],
    createdAt: existingProfile?.createdAt ?? now,
    lastLoginAt: existingProfile?.lastLoginAt ?? now,
  };

  await ref.set(profile, { merge: true });
  await createAuditEntry({
    actorUid,
    action: createdAuthUser ? "create" : "update",
    module: "usuarios",
    entityId: authUser.uid,
    changes: { accountType: "admin", email, createdAuthUser },
  });

  return { user: profile, createdAuthUser };
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
