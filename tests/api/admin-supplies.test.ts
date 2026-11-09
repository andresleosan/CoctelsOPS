import { beforeEach, describe, expect, it, vi } from "vitest";

const { requirePermission, listSupplies, createSupply, recordSupplyMovement, getSupplyById } = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  listSupplies: vi.fn(),
  createSupply: vi.fn(),
  recordSupplyMovement: vi.fn(),
  getSupplyById: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({ requirePermission }));
vi.mock("@/lib/auth/verify-request", () => ({
  toAuthorizationResponse: (error: Error & { status?: number }) =>
    Response.json({ error: error.message }, { status: error.status ?? 500 }),
}));
vi.mock("@/lib/firestore/supplies", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/firestore/supplies")>();
  return {
    ...actual,
    listSupplies,
    createSupply,
    recordSupplyMovement,
    getSupplyById,
  };
});

import { GET, POST } from "@/app/api/admin/insumos/route";
import { POST as POST_MOVEMENT } from "@/app/api/admin/insumos/[id]/movimiento/route";

describe("/api/admin/insumos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermission.mockResolvedValue({
      uid: "admin-1",
      email: "admin@coctels.com",
      profile: { accountType: "admin" },
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
    getSupplyById.mockResolvedValue({
      id: "ron-1",
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
});
