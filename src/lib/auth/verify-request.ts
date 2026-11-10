import "server-only";

import type { NextRequest } from "next/server";

import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import type { TokenClaims, UserProfile, VerifiedUser } from "@/types/auth";

export class AuthorizationError extends Error {
  readonly status: 401 | 403 | 409;

  constructor(status: 401 | 403 | 409, message: string) {
    super(message);
    this.name = "AuthorizationError";
    this.status = status;
  }
}

function getBearerToken(request: NextRequest): string {
  const value = request.headers.get("authorization");
  const match = value?.match(/^Bearer\s+([^\s]+)$/i);

  if (!match) {
    throw new AuthorizationError(401, "Se requiere una sesión válida");
  }

  return match[1];
}

export async function verifyToken(request: NextRequest): Promise<TokenClaims> {
  const token = getBearerToken(request);

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return decoded as TokenClaims;
  } catch {
    throw new AuthorizationError(401, "Se requiere una sesión válida");
  }
}

export async function verifyRequest(request: NextRequest): Promise<VerifiedUser> {
  const token = await verifyToken(request);
  const snapshot = await getAdminDb().collection("users").doc(token.uid).get();

  if (!snapshot.exists) {
    if (token.admin === true) {
      const fallbackAdminProfile: UserProfile = {
        uid: token.uid,
        email: typeof token.email === "string" ? token.email : "",
        displayName: typeof token.name === "string" ? token.name : "Administrador",
        photoURL: typeof token.picture === "string" ? token.picture : null,
        telefono: null,
        addresses: [],
        active: true,
        accountType: "admin",
        roleIds: ["admin"],
        permissions: [],
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };
      return {
        uid: token.uid,
        token,
        profile: fallbackAdminProfile,
        permissions: [],
      };
    }
    throw new AuthorizationError(401, "El perfil de usuario no está disponible");
  }

  const profile = snapshot.data() as UserProfile | undefined;
  if (!profile?.active) {
    throw new AuthorizationError(401, "La cuenta está inactiva");
  }

  return {
    uid: token.uid,
    token,
    profile,
    permissions: profile.permissions ?? [],
  };
}

/** Use this boundary for operations that require a verified email, such as purchases. */
export async function requireVerifiedEmail(request: NextRequest): Promise<VerifiedUser> {
  const verified = await verifyRequest(request);

  if (verified.token.email_verified !== true) {
    throw new AuthorizationError(403, "Verifica tu correo antes de continuar");
  }

  return verified;
}

export function toAuthorizationResponse(error: unknown): Response {
  const status = error instanceof AuthorizationError ? error.status : 500;
  const message = status === 500 ? "No fue posible completar la solicitud" : (error as Error).message;
  return Response.json({ error: message }, { status });
}
