import "server-only";

import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { AuthorizationError } from "@/lib/auth/verify-request";
import { isGlobalAdmin, hasNegocioAccess, requireNegocioAccess } from "@/lib/auth/permissions";
import { ROLE_PRESETS } from "@/lib/auth/role-presets";
import {
  STARTER_CATALOG_TEMPLATE,
  STARTER_CATEGORIES,
  buildTenantClonedProductId,
  sanitizeClonedProductInput,
} from "@/lib/catalog/starter-template";
import { writeAuditInTransaction } from "@/lib/firestore/audit";
import { productInputSchema } from "@/lib/validation/catalog";
import {
  assignNegocioStaffSchema,
  negocioInputSchema,
  negocioPatchSchema,
  usuarioNegocioSchema,
  type AssignNegocioStaffInput,
} from "@/lib/validation/tenant";
import {
  DEFAULT_TENANT_ID,
  type CloneCatalogResult,
  type CloneCatalogSource,
  type Negocio,
  type NegocioInput,
  type NegocioOnboardingSummary,
  type NegocioPatch,
  type NegocioStaffMember,
  type TenantStaffRolePresetId,
  type UsuarioNegocio,
  type UsuarioNegocioRole,
} from "@/types/tenant";
import type { Permission, VerifiedUser } from "@/types/auth";
import type { ProductInput } from "@/types/catalog";

export class TenantValidationError extends Error {
  readonly status = 422;

  constructor(message: string) {
    super(message);
    this.name = "TenantValidationError";
  }
}

export class TenantNotFoundError extends Error {
  readonly status = 404;

  constructor(message = "Negocio no encontrado") {
    super(message);
    this.name = "TenantNotFoundError";
  }
}

const LOCAL_MANAGER_PERMISSIONS: readonly Permission[] = [
  "pedidos.read",
  "pedidos.update",
  "productos.read",
  "productos.write",
  "categorias.read",
  "categorias.write",
  "clientes.read",
  "inventario.read",
  "inventario.write",
  "promociones.read",
  "promociones.write",
  "reportes.read",
  "configuracion.read",
  "configuracion.write",
  "notificaciones.read",
];

function negocioCollection() {
  return getAdminDb().collection("negocios");
}

function usuarioNegocioCollection() {
  return getAdminDb().collection("usuarios_negocio");
}

function toNegocio(id: string, data: Record<string, unknown>): Negocio {
  const parsed = negocioInputSchema.parse({
    slug: data.slug,
    name: data.name,
    description: data.description,
    active: data.active,
    plan: data.plan,
    branding: data.branding,
    configuracion: data.configuracion,
    ownerUid: data.ownerUid,
    staffUids: data.staffUids,
  });

  return {
    id,
    ...parsed,
    createdAt: (data.createdAt as string) || new Date().toISOString(),
    updatedAt: (data.updatedAt as string) || new Date().toISOString(),
  };
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

function resolveTenantRolePreset(
  role: UsuarioNegocioRole,
  requestedPreset?: TenantStaffRolePresetId,
): { id: string; name: string; description: string; permissions: Permission[] } {
  if (role === "owner" || role === "admin" || requestedPreset === "local-manager") {
    return {
      id: "local-manager",
      name: "Administrador de Local",
      description: "Opera pedidos, menú, inventario, caja, reportes y configuración de su sede.",
      permissions: [...LOCAL_MANAGER_PERMISSIONS],
    };
  }

  const presetId = requestedPreset ?? "barra-pedidos";
  const matchedPreset =
    ROLE_PRESETS.find((preset) => preset.id === presetId) ??
    ROLE_PRESETS.find((preset) => preset.id === "barra-pedidos")!;

  return {
    id: matchedPreset.id,
    name: matchedPreset.label,
    description: matchedPreset.description,
    permissions: [...matchedPreset.permissions],
  };
}

export async function getNegocioById(id: string): Promise<Negocio | null> {
  if (!id?.trim()) return null;
  const snapshot = await negocioCollection().doc(id).get();
  if (!snapshot.exists) return null;
  return toNegocio(snapshot.id, snapshot.data() as Record<string, unknown>);
}

export async function getNegocioBySlug(slug: string): Promise<Negocio | null> {
  const cleanSlug = slug?.trim().toLocaleLowerCase();
  if (!cleanSlug) return null;

  const snapshot = await negocioCollection()
    .where("slug", "==", cleanSlug)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  const negocio = toNegocio(doc.id, doc.data() as Record<string, unknown>);
  return negocio.active ? negocio : null;
}

export async function listActiveNegocios(): Promise<Negocio[]> {
  const snapshot = await negocioCollection().where("active", "==", true).get();
  return snapshot.docs.map((doc) => toNegocio(doc.id, doc.data() as Record<string, unknown>));
}

export async function listAllNegocios(caller: VerifiedUser): Promise<Negocio[]> {
  if (!isGlobalAdmin(caller)) {
    throw new AuthorizationError(403, "Solo los administradores globales pueden ver todos los negocios");
  }
  const snapshot = await negocioCollection().get();
  return snapshot.docs.map((doc) => toNegocio(doc.id, doc.data() as Record<string, unknown>));
}

export async function listAccessibleNegocios(caller: VerifiedUser): Promise<Negocio[]> {
  if (isGlobalAdmin(caller)) {
    return listAllNegocios(caller);
  }

  const ownNegocioId = caller.profile.negocioId?.trim();
  if (!ownNegocioId) {
    return [];
  }

  const ownNegocio = await getNegocioById(ownNegocioId);
  return ownNegocio ? [ownNegocio] : [];
}

export async function getNegocioOnboardingStats(
  negocioIds: string[],
): Promise<Record<string, NegocioOnboardingSummary>> {
  const uniqueIds = [...new Set(negocioIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const db = getAdminDb();
  const entries = await Promise.all(
    uniqueIds.map(async (negocioId) => {
      const [productsSnap, staffSnap] = await Promise.all([
        db.collection("productos").where("negocioId", "==", negocioId).get(),
        usuarioNegocioCollection().where("negocioId", "==", negocioId).get(),
      ]);

      const activeStaffCount = staffSnap.docs.filter((doc) => doc.data()?.active !== false).length;
      return [
        negocioId,
        {
          productCount: productsSnap.size,
          staffCount: activeStaffCount,
        },
      ] as const;
    }),
  );

  return Object.fromEntries(entries);
}

export async function createNegocio(input: NegocioInput, caller: VerifiedUser, id?: string): Promise<string> {
  if (!isGlobalAdmin(caller)) {
    throw new AuthorizationError(403, "Solo los administradores globales pueden crear negocios");
  }

  const validated = negocioInputSchema.parse(input);
  const normalizedSlug = validated.slug.toLocaleLowerCase();

  const existingSlugSnapshot = await negocioCollection().where("slug", "==", normalizedSlug).limit(1).get();
  if (!existingSlugSnapshot.empty) {
    throw new AuthorizationError(409, "El slug ya está en uso por otro negocio");
  }

  const reference = id ? negocioCollection().doc(id) : negocioCollection().doc();
  const now = new Date().toISOString();
  const data = {
    ...validated,
    slug: normalizedSlug,
    createdAt: now,
    updatedAt: now,
  };

  await getAdminDb().runTransaction(async (transaction) => {
    transaction.set(reference, data);
    writeAuditInTransaction(transaction, {
      actorUid: caller.uid,
      action: "create",
      module: "negocios",
      entityId: reference.id,
      changes: validated,
    });
  });

  return reference.id;
}

export async function updateNegocio(
  id: string,
  patch: NegocioPatch,
  caller: VerifiedUser,
): Promise<Negocio> {
  if (!hasNegocioAccess(caller, id)) {
    throw new AuthorizationError(403, "No tienes permiso para actualizar este negocio");
  }

  const validatedPatch = negocioPatchSchema.parse(patch);
  const reference = negocioCollection().doc(id);

  return await getAdminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) {
      throw new TenantNotFoundError("Negocio no encontrado");
    }

    const current = snapshot.data() as Record<string, unknown>;

    if (validatedPatch.slug && validatedPatch.slug !== current.slug) {
      const slugQuery = await negocioCollection().where("slug", "==", validatedPatch.slug).limit(1).get();
      if (!slugQuery.empty && slugQuery.docs[0].id !== id) {
        throw new AuthorizationError(409, "El slug ya está en uso por otro negocio");
      }
    }

    const merged = {
      slug: validatedPatch.slug ?? current.slug,
      name: validatedPatch.name ?? current.name,
      description: validatedPatch.description ?? current.description,
      active: validatedPatch.active !== undefined ? validatedPatch.active : current.active,
      plan: validatedPatch.plan ?? current.plan,
      branding: {
        ...(current.branding as Record<string, unknown>),
        ...(validatedPatch.branding ?? {}),
      },
      configuracion: {
        ...(current.configuracion as Record<string, unknown>),
        ...(validatedPatch.configuracion ?? {}),
      },
      ownerUid: validatedPatch.ownerUid ?? current.ownerUid,
      staffUids: validatedPatch.staffUids ?? current.staffUids,
    };

    const validatedMerged = negocioInputSchema.parse(merged);
    const now = new Date().toISOString();
    const updatedData = { ...validatedMerged, updatedAt: now };

    transaction.update(reference, updatedData);
    writeAuditInTransaction(transaction, {
      actorUid: caller.uid,
      action: "update",
      module: "negocios",
      entityId: id,
      changes: validatedPatch,
    });

    return {
      id,
      ...validatedMerged,
      createdAt: (current.createdAt as string) || now,
      updatedAt: now,
    };
  });
}

export async function cloneCatalogForNegocio(
  negocioId: string,
  caller: VerifiedUser,
  options: { source?: CloneCatalogSource; overwrite?: boolean } = {},
): Promise<CloneCatalogResult> {
  requireNegocioAccess(caller, negocioId);

  const source: CloneCatalogSource = options.source ?? "starter";
  const overwrite = options.overwrite === true;

  if (source === "default-tenant" && !isGlobalAdmin(caller)) {
    throw new AuthorizationError(
      403,
      "Solo los administradores globales pueden clonar la carta del local principal",
    );
  }

  const targetNegocio = await getNegocioById(negocioId);
  if (!targetNegocio) {
    throw new TenantNotFoundError("Negocio no encontrado");
  }

  const db = getAdminDb();
  let sourceEntries: Array<{ key: string; product: ProductInput }> = [];

  if (source === "default-tenant") {
    const defaultSnap = await db
      .collection("productos")
      .where("negocioId", "==", DEFAULT_TENANT_ID)
      .get();

    const parsedDefaults: Array<{ key: string; product: ProductInput }> = [];
    for (const doc of defaultSnap.docs) {
      const data = doc.data() as Record<string, unknown>;
      if (data.active === false) continue;
      const parsed = productInputSchema.safeParse(data);
      if (!parsed.success) continue;
      parsedDefaults.push({
        key: doc.id,
        product: sanitizeClonedProductInput(parsed.data, negocioId),
      });
    }
    sourceEntries = parsedDefaults;
  }

  if (sourceEntries.length === 0) {
    sourceEntries = STARTER_CATALOG_TEMPLATE.map((item) => ({
      key: item.key,
      product: sanitizeClonedProductInput({ ...item.product, negocioId }, negocioId),
    }));
  }

  const now = new Date().toISOString();
  let createdCount = 0;
  let skippedCount = 0;
  const productIds: string[] = [];

  await db.runTransaction(async (transaction) => {
    const categoryRefs = STARTER_CATEGORIES.map((category) => ({
      category,
      ref: db.collection("categorias").doc(category.id),
    }));
    const productRefs = sourceEntries.map((entry) => {
      const productId = buildTenantClonedProductId(negocioId, entry.key);
      return {
        productId,
        product: entry.product,
        ref: db.collection("productos").doc(productId),
      };
    });

    const [categorySnaps, productSnaps] = await Promise.all([
      Promise.all(categoryRefs.map(({ ref }) => transaction.get(ref))),
      Promise.all(productRefs.map(({ ref }) => transaction.get(ref))),
    ]);

    categoryRefs.forEach(({ category, ref }, index) => {
      if (!categorySnaps[index]?.exists) {
        transaction.set(ref, { ...category.input, updatedAt: now });
      }
    });

    productRefs.forEach(({ productId, product, ref }, index) => {
      const existingSnap = productSnaps[index];
      if (existingSnap?.exists && !overwrite) {
        skippedCount += 1;
        return;
      }

      const existingCreatedAt = existingSnap?.exists ? existingSnap.data()?.createdAt : undefined;
      const createdAt = typeof existingCreatedAt === "string" ? existingCreatedAt : now;
      transaction.set(ref, {
        ...product,
        negocioId,
        createdAt,
        updatedAt: now,
      });
      createdCount += 1;
      productIds.push(productId);
    });

    writeAuditInTransaction(transaction, {
      actorUid: caller.uid,
      action: "clone_catalog",
      module: "negocios",
      entityId: negocioId,
      changes: { source, overwrite, createdCount, skippedCount, productIds },
    });
  });

  return {
    negocioId,
    source,
    createdCount,
    skippedCount,
    productIds,
  };
}

export async function listNegocioStaff(
  negocioId: string,
  caller: VerifiedUser,
): Promise<NegocioStaffMember[]> {
  requireNegocioAccess(caller, negocioId);

  const db = getAdminDb();
  const membershipSnap = await usuarioNegocioCollection()
    .where("negocioId", "==", negocioId)
    .get();

  const memberships = membershipSnap.docs
    .map((doc) => doc.data() as UsuarioNegocio)
    .filter((item) => Boolean(item?.uid));

  const hydrated = await Promise.all(
    memberships.map(async (membership) => {
      const userSnap = await db.collection("users").doc(membership.uid).get();
      const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};
      const accountType =
        userData.accountType === "admin" || userData.accountType === "staff"
          ? userData.accountType
          : "customer";

      return {
        uid: membership.uid,
        email: typeof userData.email === "string" ? userData.email : "",
        displayName: typeof userData.displayName === "string" ? userData.displayName : null,
        negocioId: membership.negocioId,
        role: membership.role,
        active: membership.active !== false,
        assignedAt: membership.assignedAt || new Date().toISOString(),
        accountType,
        roleIds: Array.isArray(userData.roleIds)
          ? userData.roleIds.filter((roleId): roleId is string => typeof roleId === "string")
          : [],
      } satisfies NegocioStaffMember;
    }),
  );

  const roleOrder: Record<UsuarioNegocioRole, number> = {
    owner: 0,
    admin: 1,
    staff: 2,
  };

  return hydrated.sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    if (left.role !== right.role) return roleOrder[left.role] - roleOrder[right.role];
    return (left.email || left.uid).localeCompare(right.email || right.uid, "es");
  });
}

export async function assignStaffToNegocioByIdentity(
  negocioId: string,
  input: AssignNegocioStaffInput,
  caller: VerifiedUser,
): Promise<{ member: NegocioStaffMember; createdAuthUser: boolean }> {
  requireNegocioAccess(caller, negocioId);

  const validated = assignNegocioStaffSchema.parse(input);
  const auth = getAdminAuth();
  const db = getAdminDb();

  let targetUid = validated.uid?.trim() ?? "";
  let targetEmail = validated.email?.trim().toLowerCase() ?? "";
  let authDisplayName: string | null = null;
  let authPhotoUrl: string | null = null;
  let authHasAdminClaim = false;
  let createdAuthUser = false;

  if (targetEmail) {
    try {
      const authUser = await auth.getUserByEmail(targetEmail);
      targetUid = authUser.uid;
      targetEmail = (authUser.email ?? targetEmail).toLowerCase();
      authDisplayName = authUser.displayName ?? null;
      authPhotoUrl = authUser.photoURL ?? null;
      authHasAdminClaim = authUser.customClaims?.admin === true;
    } catch (lookupError) {
      if (!isAuthUserNotFoundError(lookupError)) {
        throw lookupError;
      }

      if (!validated.active) {
        throw new TenantNotFoundError("No existe una cuenta registrada con ese correo");
      }

      const cleanPassword = validated.password?.trim() ?? "";
      if (cleanPassword.length < 8) {
        throw new TenantValidationError(
          "Ese correo aún no tiene cuenta. Ingresa una contraseña temporal (mín. 8 caracteres) para crearla.",
        );
      }

      const cleanDisplayName = validated.displayName?.trim();
      const createdUser = await auth.createUser({
        email: targetEmail,
        password: cleanPassword,
        ...(cleanDisplayName ? { displayName: cleanDisplayName } : {}),
        emailVerified: true,
      });
      targetUid = createdUser.uid;
      authDisplayName = createdUser.displayName ?? cleanDisplayName ?? null;
      authPhotoUrl = createdUser.photoURL ?? null;
      createdAuthUser = true;
    }
  } else if (targetUid) {
    try {
      const authUser = await auth.getUser(targetUid);
      targetEmail = (authUser.email ?? "").toLowerCase();
      authDisplayName = authUser.displayName ?? null;
      authPhotoUrl = authUser.photoURL ?? null;
      authHasAdminClaim = authUser.customClaims?.admin === true;
    } catch (lookupError) {
      if (!isAuthUserNotFoundError(lookupError)) {
        throw lookupError;
      }
      // Allow Firestore-backed profiles in tests/emulators when UID exists in `users`
      const userDoc = await db.collection("users").doc(targetUid).get();
      if (!userDoc.exists) {
        throw new TenantNotFoundError("Usuario no encontrado");
      }
      const userData = userDoc.data() as Record<string, unknown>;
      targetEmail = typeof userData.email === "string" ? userData.email.toLowerCase() : "";
      authDisplayName = typeof userData.displayName === "string" ? userData.displayName : null;
      authPhotoUrl = typeof userData.photoURL === "string" ? userData.photoURL : null;
    }
  }

  if (!targetUid) {
    throw new TenantValidationError("No fue posible resolver el usuario destino");
  }

  if (targetUid === caller.uid && !validated.active) {
    throw new AuthorizationError(409, "No puedes desvincularte a ti mismo del local");
  }

  const membershipId = `${targetUid}_${negocioId}`;
  const membershipRef = usuarioNegocioCollection().doc(membershipId);
  const negocioRef = negocioCollection().doc(negocioId);
  const userRef = db.collection("users").doc(targetUid);
  const roleTemplate = resolveTenantRolePreset(validated.role, validated.rolePresetId);
  const roleRef = db.collection("roles").doc(roleTemplate.id);
  const now = new Date().toISOString();

  let resultingMember: NegocioStaffMember | undefined;

  await db.runTransaction(async (transaction) => {
    const [negocioSnap, userSnap, membershipSnap, roleSnap] = await Promise.all([
      transaction.get(negocioRef),
      transaction.get(userRef),
      transaction.get(membershipRef),
      transaction.get(roleRef),
    ]);

    if (!negocioSnap.exists) {
      throw new TenantNotFoundError("Negocio no encontrado");
    }

    const negocioData = negocioSnap.data() as Record<string, unknown>;
    const existingUserData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : null;
    const isTargetGlobalAdmin =
      existingUserData?.accountType === "admin" || authHasAdminClaim;

    if (!isGlobalAdmin(caller)) {
      if (isTargetGlobalAdmin) {
        throw new AuthorizationError(403, "No tienes permiso para modificar un administrador global");
      }

      const existingNegocioId =
        typeof existingUserData?.negocioId === "string" ? existingUserData.negocioId.trim() : "";
      if (existingNegocioId && existingNegocioId !== negocioId) {
        throw new AuthorizationError(403, "Este usuario ya pertenece a otro local");
      }
    }

    const existingMembership = membershipSnap.exists
      ? (membershipSnap.data() as Partial<UsuarioNegocio>)
      : undefined;
    const assignedAt =
      typeof existingMembership?.assignedAt === "string" && existingMembership.assignedAt
        ? existingMembership.assignedAt
        : now;

    if (validated.active && !isTargetGlobalAdmin && !roleSnap.exists) {
      transaction.set(roleRef, {
        name: roleTemplate.name,
        description: roleTemplate.description,
        active: true,
        permissions: roleTemplate.permissions,
        createdAt: now,
        updatedAt: now,
      });
    }

    transaction.set(membershipRef, {
      uid: targetUid,
      negocioId,
      role: validated.role,
      active: validated.active,
      assignedAt,
      updatedAt: now,
    });

    const currentStaffUids = Array.isArray(negocioData.staffUids)
      ? negocioData.staffUids.filter((item): item is string => typeof item === "string")
      : [];
    const nextStaffUids = validated.active
      ? [...new Set([...currentStaffUids, targetUid])]
      : currentStaffUids.filter((item) => item !== targetUid);

    transaction.update(negocioRef, {
      staffUids: nextStaffUids,
      updatedAt: now,
    });

    const existingRoleIds = Array.isArray(existingUserData?.roleIds)
      ? existingUserData.roleIds.filter((item): item is string => typeof item === "string")
      : [];

    let finalAccountType: "customer" | "staff" | "admin" = isTargetGlobalAdmin ? "admin" : "staff";
    let finalRoleIds = existingRoleIds;
    const resolvedEmail =
      targetEmail ||
      (typeof existingUserData?.email === "string" ? existingUserData.email : "");
    const resolvedDisplayName =
      validated.displayName?.trim() ||
      (typeof existingUserData?.displayName === "string" ? existingUserData.displayName : null) ||
      authDisplayName ||
      null;

    if (validated.active) {
      if (!isTargetGlobalAdmin) {
        const nonCustomerRoles = existingRoleIds.filter(
          (roleId) => roleId !== "customer" && roleId !== "admin",
        );
        finalRoleIds = [...new Set([...nonCustomerRoles, roleTemplate.id])];
        finalAccountType = "staff";

        transaction.set(
          userRef,
          {
            uid: targetUid,
            email: resolvedEmail,
            displayName: resolvedDisplayName,
            photoURL:
              typeof existingUserData?.photoURL === "string"
                ? existingUserData.photoURL
                : authPhotoUrl,
            telefono:
              typeof existingUserData?.telefono === "string" ? existingUserData.telefono : null,
            addresses: Array.isArray(existingUserData?.addresses) ? existingUserData.addresses : [],
            active: true,
            accountType: "staff",
            roleIds: finalRoleIds,
            negocioId,
            negocioRole: validated.role,
            createdAt:
              typeof existingUserData?.createdAt === "string" ? existingUserData.createdAt : now,
            lastLoginAt:
              typeof existingUserData?.lastLoginAt === "string" ? existingUserData.lastLoginAt : now,
            updatedAt: now,
          },
          { merge: true },
        );
      }
    } else {
      finalAccountType =
        existingUserData?.accountType === "admin" || existingUserData?.accountType === "staff"
          ? existingUserData.accountType
          : "customer";
      if (existingUserData && existingUserData.negocioId === negocioId) {
        transaction.update(userRef, {
          negocioId: null,
          negocioRole: null,
          updatedAt: now,
        });
      }
    }

    writeAuditInTransaction(transaction, {
      actorUid: caller.uid,
      action: validated.active ? "assign_tenant" : "unassign_tenant",
      module: "usuarios_negocio",
      entityId: membershipId,
      changes: {
        uid: targetUid,
        email: resolvedEmail,
        negocioId,
        role: validated.role,
        roleId: isTargetGlobalAdmin ? "admin" : roleTemplate.id,
        active: validated.active,
        createdAuthUser,
      },
    });

    resultingMember = {
      uid: targetUid,
      email: resolvedEmail,
      displayName: resolvedDisplayName,
      negocioId,
      role: validated.role,
      active: validated.active,
      assignedAt,
      accountType: finalAccountType,
      roleIds: finalRoleIds,
    };
  });

  if (!resultingMember) {
    throw new Error("No fue posible asignar el usuario al negocio");
  }

  return { member: resultingMember, createdAuthUser };
}

export async function checkUserBelongsToNegocio(uid: string, negocioId: string): Promise<boolean> {
  if (!uid || !negocioId) return false;
  const membershipId = `${uid}_${negocioId}`;
  const doc = await usuarioNegocioCollection().doc(membershipId).get();
  if (!doc.exists) return false;
  const data = doc.data() as UsuarioNegocio | undefined;
  return Boolean(data?.active);
}

export async function getUserNegocioRole(uid: string, negocioId: string): Promise<UsuarioNegocioRole | null> {
  if (!uid || !negocioId) return null;
  const membershipId = `${uid}_${negocioId}`;
  const doc = await usuarioNegocioCollection().doc(membershipId).get();
  if (!doc.exists) return null;
  const data = doc.data() as UsuarioNegocio | undefined;
  return data?.active ? data.role : null;
}

export async function assignUserToNegocio(
  input: { uid: string; negocioId: string; role: UsuarioNegocioRole; active: boolean },
  caller: VerifiedUser,
): Promise<void> {
  if (!hasNegocioAccess(caller, input.negocioId)) {
    throw new AuthorizationError(403, "No tienes permiso para gestionar el personal de este negocio");
  }

  const validated = usuarioNegocioSchema.parse(input);
  const membershipId = `${validated.uid}_${validated.negocioId}`;
  const membershipRef = usuarioNegocioCollection().doc(membershipId);
  const negocioRef = negocioCollection().doc(validated.negocioId);
  const userRef = getAdminDb().collection("users").doc(validated.uid);
  const now = new Date().toISOString();

  await getAdminDb().runTransaction(async (transaction) => {
    const negocioSnap = await transaction.get(negocioRef);
    transaction.set(membershipRef, {
      ...validated,
      assignedAt: now,
    });

    if (negocioSnap.exists) {
      const currentStaffUids = Array.isArray(negocioSnap.data()?.staffUids)
        ? (negocioSnap.data()?.staffUids as unknown[]).filter(
            (item): item is string => typeof item === "string",
          )
        : [];
      const nextStaffUids = validated.active
        ? [...new Set([...currentStaffUids, validated.uid])]
        : currentStaffUids.filter((item) => item !== validated.uid);
      transaction.update(negocioRef, { staffUids: nextStaffUids, updatedAt: now });
    }

    if (validated.active) {
      transaction.update(userRef, {
        negocioId: validated.negocioId,
        negocioRole: validated.role,
        updatedAt: now,
      });
    } else {
      transaction.update(userRef, {
        negocioId: null,
        negocioRole: null,
        updatedAt: now,
      });
    }

    writeAuditInTransaction(transaction, {
      actorUid: caller.uid,
      action: validated.active ? "assign_tenant" : "unassign_tenant",
      module: "usuarios_negocio",
      entityId: membershipId,
      changes: validated,
    });
  });
}
