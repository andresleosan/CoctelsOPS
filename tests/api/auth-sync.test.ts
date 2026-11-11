import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyToken, syncUser } = vi.hoisted(() => ({ verifyToken: vi.fn(), syncUser: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyToken,
  toAuthorizationResponse: (error: Error & { status?: number }) => Response.json({ error: error.message }, { status: error.status ?? 500 }),
}));
vi.mock("@/lib/firestore/users", () => ({ syncUser }));

import { POST } from "@/app/api/auth/sync/route";

describe("POST /api/auth/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyToken.mockResolvedValue({ uid: "user-1", email: "cliente@example.com", name: "Cliente" });
    syncUser.mockResolvedValue({
      uid: "user-1",
      email: "cliente@example.com",
      displayName: "Cliente",
      photoURL: null,
      telefono: null,
      addresses: [],
      active: true,
      accountType: "customer",
      roleIds: ["customer"],
      permissions: [],
      createdAt: "2026-08-04T00:00:00.000Z",
      lastLoginAt: "2026-08-04T00:00:00.000Z",
    });
  });

  it("sincroniza el perfil autenticado usando el uid del token", async () => {
    const response = await POST(new Request("http://localhost/api/auth/sync", {
      method: "POST",
      headers: { authorization: "Bearer token", "content-type": "application/json" },
      body: JSON.stringify({ uid: "otro-usuario", roleIds: ["admin"], displayName: "Cliente" }),
    }));

    expect(response.status).toBe(200);
    expect(syncUser).toHaveBeenCalledWith("user-1", {
      email: "cliente@example.com",
      displayName: "Cliente",
      photoURL: null,
      emailVerified: false,
    });
    await expect(response.json()).resolves.toMatchObject({ user: { uid: "user-1", accountType: "customer" } });
  });

  it("devuelve 401 cuando no hay sesión válida", async () => {
    verifyToken.mockRejectedValueOnce(Object.assign(new Error("No autenticado"), { status: 401 }));

    const response = await POST(new Request("http://localhost/api/auth/sync", { method: "POST" }));

    expect(response.status).toBe(401);
  });

  it("devuelve 401 sin actualizar cuando el perfil existente está inactivo", async () => {
    syncUser.mockRejectedValueOnce(Object.assign(new Error("La cuenta está inactiva"), { status: 401 }));

    const response = await POST(new Request("http://localhost/api/auth/sync", {
      method: "POST",
      headers: { authorization: "Bearer token" },
    }));

    expect(response.status).toBe(401);
  });
});
