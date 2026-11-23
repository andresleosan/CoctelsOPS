import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requirePermission,
  listSupplies,
  createSupply,
  recordSupplyMovement,
  getSupplyById,
  updateSupply,
} = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  listSupplies: vi.fn(),
  createSupply: vi.fn(),
  recordSupplyMovement: vi.fn(),
  getSupplyById: vi.fn(),
  updateSupply: vi.fn(),
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
vi.mock("@/lib/firestore/supplies", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/firestore/supplies")>();
  return {
    ...actual,
    listSupplies,
    createSupply,
    recordSupplyMovement,
    getSupplyById,
    updateSupply,
  };
});

import { GET, POST } from "@/app/api/admin/insumos/route";
import { GET as GET_SUPPLY, PATCH as PATCH_SUPPLY } from "@/app/api/admin/insumos/[id]/route";
import { POST as POST_MOVEMENT } from "@/app/api/admin/insumos/[id]/movimiento/route";

describe("/api/admin/insumos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermission.mockResolvedValue({
      uid: "admin-1",
      email: "admin@coctels.com",
      token: { uid: "admin-1", admin: true },
      profile: {
        uid: "admin-1",
        email: "admin@coctels.com",
        active: true,
        accountType: "admin",
      },
    });
    listSupplies.mockResolvedValue([
      {
        id: "ron-1",
        negocioId: "coctels-ops",
        name: "Ron Medellín 750ml",
        category: "licor",
        unit: "botella",
        currentStock: 5,
        minStock: 2,
        costPerUnit: 35000,
        status: "ok",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ]);
    createSupply.mockResolvedValue({
      id: "pulpa-1",
      name: "Pulpa Maracuyá",
      category: "pulpa",
      unit: "kg",
      currentStock: 10,
      minStock: 2,
      costPerUnit: 12000,
      status: "ok",
    });
  });

  it("requiere permiso inventario.read y devuelve lista con KPIs", async () => {
    const res = await GET(new Request("http://localhost/api/admin/insumos"));
    expect(res.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), "inventario.read");

    const data = await res.json();
    expect(data.supplies).toHaveLength(1);
    expect(data.kpis).toEqual(
      expect.objectContaining({
        total: 1,
        ok: 1,
        criticos: 0,
        valorTotalCop: 175000,
      })
    );
  });

  it("permite crear un nuevo insumo con inventario.write", async () => {
    const body = {
      name: "Pulpa Maracuyá",
      category: "pulpa",
      unit: "kg",
      currentStock: 10,
      minStock: 2,
      costPerUnit: 12000,
    };

    const res = await POST(
      new Request("http://localhost/api/admin/insumos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );

    expect(res.status).toBe(201);
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), "inventario.write");
    expect(createSupply).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Pulpa Maracuyá", category: "pulpa" }),
      "admin-1"
    );
  });

  it("rechaza inputs inválidos al crear insumo", async () => {
    const res = await POST(
      new Request("http://localhost/api/admin/insumos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      })
    );

    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it("registra un movimiento de entrada o merma en /api/admin/insumos/[id]/movimiento", async () => {
    recordSupplyMovement.mockResolvedValue({
      id: "mov-1",
      supplyId: "ron-1",
      type: "entrada",
      quantity: 5,
      previousStock: 5,
      resultingStock: 10,
      reason: "Compra semanal",
    });
    getSupplyById
      .mockResolvedValueOnce({
        id: "ron-1",
        negocioId: "coctels-ops",
        name: "Ron Medellín 750ml",
        currentStock: 5,
      })
      .mockResolvedValueOnce({
        id: "ron-1",
        negocioId: "coctels-ops",
        name: "Ron Medellín 750ml",
        currentStock: 10,
      });

    const res = await POST_MOVEMENT(
      new Request("http://localhost/api/admin/insumos/ron-1/movimiento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "entrada",
          quantity: 5,
          reason: "Compra semanal",
        }),
      }),
      { params: Promise.resolve({ id: "ron-1" }) }
    );

    expect(res.status).toBe(201);
    expect(recordSupplyMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        supplyId: "ron-1",
        type: "entrada",
        quantity: 5,
        reason: "Compra semanal",
        actorUid: "admin-1",
      })
    );
  });

  describe("aislamiento multi-tenant (negocioId)", () => {
    const staffLocalA = {
      uid: "staff-a",
      token: { uid: "staff-a", admin: false },
      profile: {
        uid: "staff-a",
        email: "staff@locala.com",
        active: true,
        accountType: "staff",
        negocioId: "local-a",
      },
    };

    beforeEach(() => {
      requirePermission.mockResolvedValue(staffLocalA);
    });

    it("rechaza con 403 consultar insumos de otro negocio", async () => {
      const res = await GET(new Request("http://localhost/api/admin/insumos?negocioId=local-b"));
      expect(res.status).toBe(403);
      expect(listSupplies).not.toHaveBeenCalled();
    });

    it("rechaza con 403 crear un insumo en otro negocio", async () => {
      const res = await POST(
        new Request("http://localhost/api/admin/insumos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            negocioId: "local-b",
            name: "Ron Ajeno",
            category: "licor",
            unit: "botella",
            currentStock: 3,
            minStock: 1,
          }),
        })
      );
      expect(res.status).toBe(403);
      expect(createSupply).not.toHaveBeenCalled();
    });

    it("rechaza con 403 consultar o actualizar un insumo de otro negocio", async () => {
      getSupplyById.mockResolvedValue({
        id: "sup-b",
        negocioId: "local-b",
        name: "Pulpa Lulo Ajena",
      });

      const getRes = await GET_SUPPLY(
        new Request("http://localhost/api/admin/insumos/sup-b"),
        { params: Promise.resolve({ id: "sup-b" }) }
      );
      expect(getRes.status).toBe(403);

      const patchRes = await PATCH_SUPPLY(
        new Request("http://localhost/api/admin/insumos/sup-b", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ minStock: 10 }),
        }),
        { params: Promise.resolve({ id: "sup-b" }) }
      );
      expect(patchRes.status).toBe(403);
      expect(updateSupply).not.toHaveBeenCalled();
    });

    it("rechaza con 403 registrar movimiento sobre un insumo ajeno y 404 si no existe", async () => {
      getSupplyById.mockResolvedValueOnce({
        id: "sup-b",
        negocioId: "local-b",
        name: "Pulpa Lulo Ajena",
      });

      const forbiddenRes = await POST_MOVEMENT(
        new Request("http://localhost/api/admin/insumos/sup-b/movimiento", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "entrada",
            quantity: 2,
            reason: "Intento cross-tenant",
          }),
        }),
        { params: Promise.resolve({ id: "sup-b" }) }
      );
      expect(forbiddenRes.status).toBe(403);
      expect(recordSupplyMovement).not.toHaveBeenCalled();

      getSupplyById.mockResolvedValueOnce(null);
      const notFoundRes = await POST_MOVEMENT(
        new Request("http://localhost/api/admin/insumos/missing/movimiento", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "entrada",
            quantity: 2,
            reason: "Insumo inexistente",
          }),
        }),
        { params: Promise.resolve({ id: "missing" }) }
      );
      expect(notFoundRes.status).toBe(404);
    });
  });
});
