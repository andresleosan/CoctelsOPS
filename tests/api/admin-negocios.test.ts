import { beforeEach, describe, expect, it, vi } from "vitest";

const { requirePermission, getNegocioById, updateNegocio } = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getNegocioById: vi.fn(),
  updateNegocio: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    requirePermission,
  };
});
vi.mock("@/lib/auth/verify-request", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/verify-request")>();
  return {
    ...actual,
    toAuthorizationResponse: (error: Error & { status?: number }) =>
      Response.json({ error: error.message }, { status: error.status ?? 500 }),
  };
});
vi.mock("@/lib/firestore/tenant", () => ({
  getNegocioById,
  updateNegocio,
}));

import { GET } from "@/app/api/admin/negocios/[id]/route";

describe("/api/admin/negocios/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getNegocioById.mockResolvedValue({ id: "local-a", name: "Local A" });
  });

  it("permite a un admin global consultar cualquier negocio", async () => {
    requirePermission.mockResolvedValue({
      uid: "admin-1",
      token: { uid: "admin-1", admin: true },
      profile: { uid: "admin-1", active: true, accountType: "admin" },
    });

    const res = await GET(new Request("http://localhost/api/admin/negocios/local-b"), {
      params: Promise.resolve({ id: "local-b" }),
    });

    expect(res.status).toBe(200);
    expect(getNegocioById).toHaveBeenCalledWith("local-b");
  });

  it("permite a un staff consultar su propio negocio pero rechaza con 403 otro negocio", async () => {
    requirePermission.mockResolvedValue({
      uid: "staff-a",
      token: { uid: "staff-a", admin: false },
      profile: {
        uid: "staff-a",
        active: true,
        accountType: "staff",
        negocioId: "local-a",
      },
    });

    const ownRes = await GET(new Request("http://localhost/api/admin/negocios/local-a"), {
      params: Promise.resolve({ id: "local-a" }),
    });
    expect(ownRes.status).toBe(200);

    const otherRes = await GET(new Request("http://localhost/api/admin/negocios/local-b"), {
      params: Promise.resolve({ id: "local-b" }),
    });
    expect(otherRes.status).toBe(403);
    expect(getNegocioById).toHaveBeenCalledTimes(1);
  });
});
