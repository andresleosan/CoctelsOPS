import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getStoreConfiguration: vi.fn(),
  listPublicBarDisplayOrders: vi.fn(),
  getNegocioById: vi.fn(),
  getNegocioBySlug: vi.fn(),
}));

vi.mock("@/lib/firestore/configuration", () => ({
  getStoreConfiguration: mocks.getStoreConfiguration,
}));

vi.mock("@/lib/firestore/orders", () => ({
  listPublicBarDisplayOrders: mocks.listPublicBarDisplayOrders,
}));

vi.mock("@/lib/firestore/tenant", () => ({
  getNegocioById: mocks.getNegocioById,
  getNegocioBySlug: mocks.getNegocioBySlug,
}));

import { GET } from "@/app/api/pantalla/route";
import type { BarDisplaySnapshot } from "@/types/display";

describe("GET /api/pantalla", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStoreConfiguration.mockResolvedValue({
      whatsappNumber: "573001112233",
      businessHours: [],
      deliveryZones: ["Centro"],
      estimatedDeliveryMinutes: 30,
      emergencyPause: {
        active: true,
        reason: "Barra saturada 15 minutos",
      },
      messages: {
        orderReceived: "ok",
        orderStatus: "ok",
        unavailable: "no",
      },
    });
    mocks.listPublicBarDisplayOrders.mockResolvedValue({
      preparing: [
        {
          orderId: "ord-11aa",
          turnCode: "#11AA",
          displayName: "Camila R.",
          serviceType: "pickup",
          itemsCount: 2,
          stage: "preparing",
          status: "preparando",
          createdAt: "2026-11-26T21:00:00.000Z",
          updatedAt: "2026-11-26T21:02:00.000Z",
        },
      ],
      ready: [
        {
          orderId: "ord-22bb",
          turnCode: "#22BB",
          displayName: "Mateo G.",
          serviceType: "mesa",
          tableNumber: "Mesa 5",
          itemsCount: 3,
          stage: "ready",
          status: "en_camino",
          createdAt: "2026-11-26T20:50:00.000Z",
          updatedAt: "2026-11-26T21:04:00.000Z",
        },
      ],
    });
  });

  it("retorna turnos públicos sin PII y con Cache-Control no-store para el local principal", async () => {
    const response = await GET(new Request("http://localhost:9002/api/pantalla"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = (await response.json()) as BarDisplaySnapshot;
    expect(body.negocioId).toBe("coctels-ops");
    expect(body.storeName).toBe("Coctels OPS");
    expect(body.emergencyPauseActive).toBe(true);
    expect(body.emergencyPauseReason).toBe("Barra saturada 15 minutos");
    expect(body.preparing).toHaveLength(1);
    expect(body.ready).toHaveLength(1);

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("phone");
    expect(serialized).not.toContain("address");
    expect(serialized).not.toContain("clienteUid");
    expect(serialized).not.toContain("paymentProof");
    expect(serialized).not.toContain("audit");
  });

  it("resuelve branding y órdenes aisladas cuando se pasa ?slug=", async () => {
    mocks.getNegocioBySlug.mockResolvedValue({
      id: "neg-laureles",
      slug: "laureles-ops",
      name: "Coctels Laureles",
      active: true,
      branding: {
        logoUrl: "https://cdn.example.com/laureles.png",
        primaryColor: "#E5196E",
        accentColor: "#00BCD4",
        slogan: "Fresco",
      },
      configuracion: {
        emergencyPause: { active: false },
      },
    });

    const response = await GET(
      new Request("http://localhost:9002/api/pantalla?slug=laureles-ops"),
    );
    expect(response.status).toBe(200);
    expect(mocks.listPublicBarDisplayOrders).toHaveBeenCalledWith("neg-laureles");

    const body = (await response.json()) as BarDisplaySnapshot;
    expect(body.negocioId).toBe("neg-laureles");
    expect(body.slug).toBe("laureles-ops");
    expect(body.storeName).toBe("Coctels Laureles");
    expect(body.logoUrl).toBe("https://cdn.example.com/laureles.png");
    expect(body.emergencyPauseActive).toBe(false);
  });

  it("retorna 404 cuando el slug o negocioId no está disponible", async () => {
    mocks.getNegocioBySlug.mockResolvedValue(null);
    const resSlug = await GET(
      new Request("http://localhost:9002/api/pantalla?slug=inexistente"),
    );
    expect(resSlug.status).toBe(404);

    mocks.getNegocioById.mockResolvedValue({ id: "neg-off", active: false });
    const resId = await GET(
      new Request("http://localhost:9002/api/pantalla?negocioId=neg-off"),
    );
    expect(resId.status).toBe(404);
  });
});
