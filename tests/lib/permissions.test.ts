import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NextRequest } from "next/server";

import type { UserProfile } from "@/types/auth";

const { verifyIdToken, get } = vi.hoisted(() => ({ verifyIdToken: vi.fn(), get: vi.fn() }));

vi.mock("@/lib/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
  getAdminDb: () => ({ collection: () => ({ doc: () => ({ get }) }) }),
}));

import {
  buildAdminAccessDiagnostic,
  hasPermission,
  isGlobalAdmin,
  requirePermission,
  requireUserOwnership,
} from "@/lib/auth/permissions";
import { ALL_ADMIN_PERMISSIONS } from "@/types/auth";
import { requireVerifiedEmail, verifyRequest } from "@/lib/auth/verify-request";

function request(token?: string): NextRequest {
  return new Request("http://localhost/api/test", {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  }) as NextRequest;
}

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "user-1",
    email: "cliente@example.com",
    displayName: "Cliente",
    photoURL: null,
    telefono: null,
    addresses: [],
    active: true,
    accountType: "customer",
    roleIds: ["customer"],
    permissions: ["pedidos.read"],
    createdAt: "2026-08-04T00:00:00.000Z",
    lastLoginAt: "2026-08-04T00:00:00.000Z",
    ...overrides,
  };
}

describe("authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({ exists: true, data: () => profile() });
    verifyIdToken.mockResolvedValue({ uid: "user-1", email: "cliente@example.com", admin: false });
  });

  it("rechaza una solicitud sin bearer con 401", async () => {
    await expect(verifyRequest(request())).rejects.toMatchObject({ status: 401 });
  });

  it("rechaza un token inválido con 401", async () => {
    verifyIdToken.mockRejectedValueOnce(new Error("invalid token"));

    await expect(verifyRequest(request("mal-token"))).rejects.toMatchObject({ status: 401 });
  });

  it("rechaza un perfil inactivo con 401", async () => {
    get.mockResolvedValueOnce({ exists: true, data: () => profile({ active: false }) });

    await expect(verifyRequest(request("token"))).rejects.toMatchObject({ status: 401 });
  });

  it("rechaza un permiso faltante con 403", async () => {
    await expect(requirePermission(request("token"), "usuarios.manage")).rejects.toMatchObject({ status: 403 });
  });

  it("permite acceso directo al propio usuario", async () => {
    const verified = await requirePermission(request("token"), "pedidos.read");

    expect(verified.uid).toBe("user-1");
    expect(verified.uid === "user-1").toBe(true);
  });

  it("permite todos los permisos a un administrador bootstrap activo", async () => {
    get.mockResolvedValueOnce({ exists: true, data: () => profile({ accountType: "admin", permissions: [] }) });
    verifyIdToken.mockResolvedValueOnce({ uid: "user-1", email: "admin@example.com", admin: true });

    const verified = await requirePermission(request("token"), "roles.write");

    expect(verified.profile.accountType).toBe("admin");
    expect(hasPermission(verified.profile, "roles.write")).toBe(true);
  });

  it("no eleva un perfil admin si el claim estricto no está presente", async () => {
    get.mockResolvedValueOnce({ exists: true, data: () => profile({ accountType: "admin", permissions: [] }) });
    verifyIdToken.mockResolvedValueOnce({ uid: "user-1", email: "admin@example.com", admin: false });

    await expect(requirePermission(request("token"), "roles.write")).rejects.toMatchObject({ status: 403 });
  });

  it("rechaza una solicitud de correo no verificado con 403", async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: "user-1", email: "cliente@example.com", email_verified: false, admin: false });

    await expect(requireVerifiedEmail(request("token"))).rejects.toMatchObject({ status: 403 });
  });

  it("permite una solicitud de correo verificado", async () => {
    verifyIdToken.mockResolvedValueOnce({ uid: "user-1", email: "cliente@example.com", email_verified: true, admin: false });

    await expect(requireVerifiedEmail(request("token"))).resolves.toMatchObject({ uid: "user-1" });
  });

  it("rechaza que un usuario solicite el uid de otra persona", async () => {
    const verified = await requirePermission(request("token"), "pedidos.read");

    expect(() => requireUserOwnership(verified, "user-2")).toThrow();
  });

  it("otorga todos los permisos administrativos al correo propietario verificado andres.san1404@gmail.com", async () => {
    get.mockResolvedValueOnce({
      exists: true,
      data: () =>
        profile({
          uid: "owner-1",
          email: "andres.san1404@gmail.com",
          accountType: "customer",
          roleIds: ["customer"],
          permissions: [],
        }),
    });
    verifyIdToken.mockResolvedValueOnce({
      uid: "owner-1",
      email: "andres.san1404@gmail.com",
      email_verified: true,
      admin: false,
    });

    const verified = await requirePermission(request("token"), "configuracion.write");
    const diagnostic = buildAdminAccessDiagnostic(verified, []);

    expect(verified.profile.accountType).toBe("admin");
    expect(isGlobalAdmin(verified)).toBe(true);
    expect(diagnostic.isAdmin).toBe(true);
    expect(diagnostic.isOwnerEmail).toBe(true);
    expect(diagnostic.emailVerified).toBe(true);
    expect(diagnostic.hasCustomClaim).toBe(false);
    expect(diagnostic.effectivePermissions).toEqual([...ALL_ADMIN_PERMISSIONS]);
  });

  it("bloquea el correo propietario si email_verified es false y no tiene claim admin", async () => {
    get.mockResolvedValueOnce({
      exists: true,
      data: () =>
        profile({
          uid: "owner-1",
          email: "andres.san1404@gmail.com",
          accountType: "customer",
          permissions: [],
        }),
    });
    verifyIdToken.mockResolvedValueOnce({
      uid: "owner-1",
      email: "andres.san1404@gmail.com",
      email_verified: false,
      admin: false,
    });

    await expect(requirePermission(request("token"), "roles.write")).rejects.toMatchObject({ status: 403 });
  });
});
