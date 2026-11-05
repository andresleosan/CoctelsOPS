import "server-only";

import { getAdminDb } from "@/lib/firebase-admin";
import { AuthorizationError } from "@/lib/auth/verify-request";
import { isGlobalAdmin, hasNegocioAccess } from "@/lib/auth/permissions";
import { writeAuditInTransaction } from "@/lib/firestore/audit";
import {
  negocioInputSchema,
  negocioPatchSchema,
  usuarioNegocioSchema,
} from "@/lib/validation/tenant";
import type {
  Negocio,
  NegocioInput,
  NegocioPatch,
  UsuarioNegocio,
  UsuarioNegocioRole,
} from "@/types/tenant";
import type { VerifiedUser } from "@/types/auth";

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

export async function createNegocio(input: NegocioInput, caller: VerifiedUser, id?: string): Promise<string> {
  if (!isGlobalAdmin(caller)) {
    throw new AuthorizationError(403, "Solo los administradores globales pueden crear negocios");
  }

  const validated = negocioInputSchema.parse(input);
  const normalizedSlug = validated.slug.toLocaleLowerCase();

  // Comprobar colisión de slug
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
      throw new Error("Negocio no encontrado");
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
  const userRef = getAdminDb().collection("users").doc(validated.uid);
  const now = new Date().toISOString();

  await getAdminDb().runTransaction(async (transaction) => {
    transaction.set(membershipRef, {
      ...validated,
      assignedAt: now,
    });

    transaction.update(userRef, {
      negocioId: validated.negocioId,
      negocioRole: validated.role,
      updatedAt: now,
    });

    writeAuditInTransaction(transaction, {
      actorUid: caller.uid,
      action: "assign_tenant",
      module: "usuarios_negocio",
      entityId: membershipId,
      changes: validated,
    });
  });
}
