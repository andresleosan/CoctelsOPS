import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyIdToken, get } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  get: vi.fn(),
}));

vi.mock("@/lib/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken }),
  getAdminDb: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: () => get(name, id),
      }),
    }),
  }),
}));

import { GET } from "@/app/api/auth/session/route";
import { ALL_ADMIN_PERMISSIONS } from "@/types/auth";

describe("GET /api/auth/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve adminAccess completo para el propietario andres.san1404@gmail.com con correo verificado", async () => {
    verifyIdToken.mockResolvedValueOnce({
      uid: "owner-uid",
      email: "andres.san1404@gmail.com",
      email_verified: true,
      name: "Andres Santiago",
    });
    get.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        uid: "owner-uid",
        email: "andres.san1404@gmail.com",
        displayName: "Andres Santiago",
        photoURL: null,
        telefono: null,
        addresses: [],
        active: true,
        accountType: "admin",
        roleIds: ["admin"],
        permissions: [],
        createdAt: "2026-08-04T00:00:00.000Z",
        lastLoginAt: "2026-08-04T00:00:00.000Z",
      }),
    });

    const response = await GET(
      new Request("http://localhost/api/auth/session", {
        headers: { Authorization: "Bearer valid-token" },
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      user: { accountType: string; email: string };
      adminAccess: {
        isAdmin: boolean;
        isOwnerEmail: boolean;
        emailVerified: boolean;
        hasCustomClaim: boolean;
        effectivePermissions: string[];
      };
    };
    expect(body.user.accountType).toBe("admin");
    expect(body.adminAccess).toEqual({
      isAdmin: true,
      hasCustomClaim: false,
      isOwnerEmail: true,
      emailVerified: true,
      accountType: "admin",
      active: true,
      effectivePermissions: [...ALL_ADMIN_PERMISSIONS],
    });
  });

  it("resuelve permisos asignados por rol para un miembro de staff", async () => {
    verifyIdToken.mockResolvedValueOnce({
      uid: "staff-uid",
      email: "barra@coctelsops.com",
      email_verified: true,
      admin: false,
    });
    get.mockImplementation(async (collectionName: string) => {
      if (collectionName === "users") {
        return {
          exists: true,
          data: () => ({
            uid: "staff-uid",
            email: "barra@coctelsops.com",
            displayName: "Bartender",
            photoURL: null,
            telefono: null,
            addresses: [],
            active: true,
            accountType: "staff",
            roleIds: ["bartender"],
            permissions: [],
            createdAt: "2026-08-04T00:00:00.000Z",
            lastLoginAt: "2026-08-04T00:00:00.000Z",
          }),
        };
      }
      return {
        exists: true,
        data: () => ({
          id: "bartender",
          name: "Bartender",
          description: "Barra",
          active: true,
          permissions: ["pedidos.read", "pedidos.update"],
        }),
      };
    });

    const response = await GET(
      new Request("http://localhost/api/auth/session", {
        headers: { Authorization: "Bearer staff-token" },
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      user: { permissions: string[] };
      adminAccess: { isAdmin: boolean; effectivePermissions: string[] };
    };
    expect(body.user.permissions).toEqual(["pedidos.read", "pedidos.update"]);
    expect(body.adminAccess.isAdmin).toBe(false);
    expect(body.adminAccess.effectivePermissions).toEqual(["pedidos.read", "pedidos.update"]);
  });

  it("devuelve 401 sin encabezado Authorization", async () => {
    const response = await GET(new Request("http://localhost/api/auth/session"));
    expect(response.status).toBe(401);
  });
});
