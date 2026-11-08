import { beforeEach, describe, expect, it, vi } from "vitest";

const { requirePermission, listUsers, mockGetAdminDb } = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  listUsers: vi.fn(),
  mockGetAdminDb: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({ requirePermission }));
vi.mock("@/lib/auth/verify-request", () => ({
  toAuthorizationResponse: (error: Error & { status?: number }) =>
    Response.json({ error: error.message }, { status: error.status ?? 500 }),
}));
vi.mock("@/lib/firestore/users", () => ({ listUsers }));
vi.mock("@/lib/firebase-admin", () => ({ getAdminDb: mockGetAdminDb }));

import { GET } from "@/app/api/admin/clientes/route";

describe("GET /api/admin/clientes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermission.mockResolvedValue({
      uid: "admin-1",
      profile: { accountType: "admin" },
    });

    listUsers.mockResolvedValue([
      {
        uid: "cust-1",
        email: "c1@test.com",
        displayName: "Cliente Uno",
        telefono: "3001234567",
        photoURL: null,
        addresses: [],
        active: true,
        accountType: "customer",
        roleIds: ["customer"],
        permissions: [],
        createdAt: "2026-05-01T00:00:00.000Z",
        lastLoginAt: "2026-05-01T00:00:00.000Z",
      },
      {
        uid: "staff-1",
        email: "staff@test.com",
        displayName: "Staff Uno",
        telefono: null,
        addresses: [],
        active: true,
        accountType: "staff",
        roleIds: ["staff"],
        permissions: [],
        createdAt: "2026-05-01T00:00:00.000Z",
        lastLoginAt: "2026-05-01T00:00:00.000Z",
      },
    ]);

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

    mockGetAdminDb.mockReturnValue({
      collection: (col: string) => {
        if (col === "pedidos") {
          return {
            get: vi.fn().mockResolvedValue({
              docs: [
                {
                  id: "order-1",
                  data: () => ({
                    clienteUid: "cust-1",
                    total: 30000,
                    status: "entregado",
                    createdAt: threeDaysAgo,
                    loyaltyPointsEarned: 30,
                  }),
                },
                {
                  id: "order-2",
                  data: () => ({
                    clienteUid: "cust-1",
                    total: 20000,
                    status: "entregado",
                    createdAt: yesterday,
                    loyaltyPointsEarned: 20,
                  }),
                },
              ],
            }),
          };
        }
        return { get: vi.fn().mockResolvedValue({ docs: [] }) };
      },
    });
  });

  it("exige el permiso 'clientes.read'", async () => {
    const request = new Request("http://localhost/api/admin/clientes");
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), "clientes.read");
  });

  it("retorna únicamente clientes consolidando sus métricas CRM", async () => {
    const request = new Request("http://localhost/api/admin/clientes");
    const response = await GET(request);
    const body = (await response.json()) as {
      customers: Array<{ uid: string; totalSpent: number; averageTicket: number; segment: string }>;
      metrics: { totalCustomers: number; totalSpentAllCustomers: number };
    };

    expect(response.status).toBe(200);
    // Solo debe incluir el usuario con accountType === 'customer'
    expect(body.customers).toHaveLength(1);
    expect(body.customers[0].uid).toBe("cust-1");
    expect(body.customers[0].totalSpent).toBe(50000);
    expect(body.customers[0].averageTicket).toBe(25000);
    expect(body.customers[0].segment).toBe("frecuente");

    // Métricas globales
    expect(body.metrics.totalCustomers).toBe(1);
    expect(body.metrics.totalSpentAllCustomers).toBe(50000);
  });

  it("maneja errores de autorización retornando el status correspondiente", async () => {
    requirePermission.mockRejectedValueOnce(
      Object.assign(new Error("No autorizado"), { status: 403 })
    );

    const request = new Request("http://localhost/api/admin/clientes");
    const response = await GET(request);

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("No autorizado");
  });
});
