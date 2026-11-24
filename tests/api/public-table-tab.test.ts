import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockBarTabError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
      super(message);
      this.name = "BarTabError";
      this.status = status;
    }
  }

  return {
    MockBarTabError,
    getAdminDb: vi.fn(),
    getRateLimitIdentity: vi.fn(),
    hashRateLimitIdentity: vi.fn(),
    verifyToken: vi.fn(),
    getNegocioById: vi.fn(),
    getNegocioBySlug: vi.fn(),
    getPublicTableTab: vi.fn(),
    addPublicRoundToTableTab: vi.fn(),
    requestTableBill: vi.fn(),
    reserveTableActionRateLimit: vi.fn(),
  };
});

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: mocks.getAdminDb,
}));

vi.mock("@/lib/ai/ai-rate-limit", () => ({
  getRateLimitIdentity: mocks.getRateLimitIdentity,
  hashRateLimitIdentity: mocks.hashRateLimitIdentity,
}));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyToken: mocks.verifyToken,
}));

vi.mock("@/lib/firestore/tenant", () => ({
  getNegocioById: mocks.getNegocioById,
  getNegocioBySlug: mocks.getNegocioBySlug,
}));

vi.mock("@/lib/firestore/tabs", () => ({
  BarTabError: mocks.MockBarTabError,
  getPublicTableTab: mocks.getPublicTableTab,
  addPublicRoundToTableTab: mocks.addPublicRoundToTableTab,
  requestTableBill: mocks.requestTableBill,
  reserveTableActionRateLimit: mocks.reserveTableActionRateLimit,
}));

import { GET, POST } from "@/app/api/mesas/[mesaId]/route";
import type { PublicTableTab } from "@/types/tabs";

const sampleTab: PublicTableTab = {
  id: "tab-4",
  negocioId: "coctels-ops",
  tableNumber: "Mesa 4",
  guestCount: 2,
  status: "abierta",
  rounds: [
    {
      roundNumber: 1,
      orderId: "ord-1",
      orderStatus: "pendiente",
      items: [
        {
          productId: "prod-1",
          name: "Granizado Maracuyá",
          quantity: 1,
          unitPrice: 15000,
          subtotal: 15000,
          customization: { size: "16 oz", flavors: ["Maracuyá"], addOns: [] },
        },
      ],
      subtotal: 15000,
      createdAt: "2026-11-22T20:00:00.000Z",
      source: "cliente_qr",
    },
  ],
  itemsCount: 1,
  subtotal: 15000,
  total: 15000,
  openedAt: "2026-11-22T20:00:00.000Z",
  updatedAt: "2026-11-22T20:00:00.000Z",
};

describe("/api/mesas/[mesaId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRateLimitIdentity.mockReturnValue("190.1.2.3");
    mocks.hashRateLimitIdentity.mockReturnValue("table-rate-digest");
    mocks.reserveTableActionRateLimit.mockResolvedValue(true);
    mocks.getNegocioById.mockResolvedValue({ id: "neg-1", active: true });
    mocks.getNegocioBySlug.mockResolvedValue({ id: "neg-la-70", active: true });
    mocks.getPublicTableTab.mockResolvedValue({ tableNumber: "Mesa 4", tab: sampleTab });
    mocks.addPublicRoundToTableTab.mockResolvedValue({
      tab: sampleTab,
      orderId: "ord-1",
      round: sampleTab.rounds[0],
      createdTab: true,
      idempotentReplay: false,
    });
    mocks.requestTableBill.mockResolvedValue({
      tab: {
        ...sampleTab,
        billRequest: {
          requestedAt: "2026-11-22T20:10:00.000Z",
          splitMode: "equal",
          guestCount: 3,
          perPersonAmount: 5000,
          preferredMethod: "nequi",
        },
      },
    });
  });

  it("GET consulta la cuenta en vivo sin exigir sesión ni correo verificado", async () => {
    const request = new Request("http://localhost:9002/api/mesas/4");
    const response = await GET(request, { params: Promise.resolve({ mesaId: "4" }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.getPublicTableTab).toHaveBeenCalledWith("coctels-ops", "4");

    const data = await response.json();
    expect(data.tableNumber).toBe("Mesa 4");
    expect(data.tab.total).toBe(15000);
  });

  it("GET resuelve el local por slug y retorna 404 si el local no existe", async () => {
    mocks.getNegocioBySlug.mockResolvedValueOnce(null);

    const request = new Request("http://localhost:9002/api/mesas/4?slug=inexistente");
    const response = await GET(request, { params: Promise.resolve({ mesaId: "4" }) });

    expect(response.status).toBe(404);
    expect(mocks.getPublicTableTab).not.toHaveBeenCalled();
  });

  it("rechaza el modo retiro en barra o identificadores de mesa inválidos con 422", async () => {
    const barraRes = await GET(new Request("http://localhost:9002/api/mesas/Barra"), {
      params: Promise.resolve({ mesaId: "Barra" }),
    });
    expect(barraRes.status).toBe(422);

    const invalidRes = await GET(new Request("http://localhost:9002/api/mesas/..%2Fadmin"), {
      params: Promise.resolve({ mesaId: "..%2Fadmin" }),
    });
    expect(invalidRes.status).toBe(422);
  });

  it("POST permite enviar ronda QR sin autenticación ni email verificado y soporta idempotencia", async () => {
    const body = {
      action: "add_round",
      slug: "la-70",
      customerName: "Laura",
      items: [
        {
          productId: "prod-1",
          quantity: 1,
          customization: { size: "16 oz", flavors: ["Maracuyá"], addOns: [] },
        },
      ],
    };

    const request = new Request("http://localhost:9002/api/mesas/Mesa%204", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "idempotency-key": "idem-qr-123",
      },
      body: JSON.stringify(body),
    });

    const response = await POST(request, { params: Promise.resolve({ mesaId: "Mesa%204" }) });
    expect(response.status).toBe(201);
    expect(mocks.addPublicRoundToTableTab).toHaveBeenCalledWith(
      expect.objectContaining({
        negocioId: "neg-la-70",
        tableNumber: "Mesa 4",
        customerName: "Laura",
        idempotencyKey: "idem-qr-123",
      }),
    );

    mocks.addPublicRoundToTableTab.mockResolvedValueOnce({
      tab: sampleTab,
      orderId: "ord-1",
      round: sampleTab.rounds[0],
      createdTab: false,
      idempotentReplay: true,
    });

    const replayResponse = await POST(
      new Request("http://localhost:9002/api/mesas/Mesa%204", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": "idem-qr-123",
        },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ mesaId: "Mesa%204" }) },
    );

    expect(replayResponse.status).toBe(200);
  });

  it("POST acepta sesión opcional aunque verifyToken falle sin bloquear al cliente", async () => {
    mocks.verifyToken.mockRejectedValueOnce(new Error("Token expirado"));

    const request = new Request("http://localhost:9002/api/mesas/4", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer expired-token",
      },
      body: JSON.stringify({
        action: "add_round",
        items: [
          {
            productId: "prod-1",
            quantity: 1,
            customization: { size: "16 oz", flavors: ["Maracuyá"], addOns: [] },
          },
        ],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ mesaId: "4" }) });
    expect(response.status).toBe(201);
  });

  it("POST retorna 429 con Retry-After cuando excede el rate limit de mesa", async () => {
    mocks.reserveTableActionRateLimit.mockResolvedValueOnce(false);

    const request = new Request("http://localhost:9002/api/mesas/4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "request_bill",
        splitMode: "single",
        guestCount: 1,
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ mesaId: "4" }) });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("600");
    const data = await response.json();
    expect(data.code).toBe("RATE_LIMITED");
  });

  it("POST procesa solicitud de cuenta dividida y retorna errores 400/422/404 limpios", async () => {
    const okRes = await POST(
      new Request("http://localhost:9002/api/mesas/4", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_bill",
          splitMode: "equal",
          guestCount: 3,
          preferredMethod: "nequi",
        }),
      }),
      { params: Promise.resolve({ mesaId: "4" }) },
    );

    expect(okRes.status).toBe(200);
    expect(mocks.requestTableBill).toHaveBeenCalledWith(
      expect.objectContaining({
        negocioId: "coctels-ops",
        tableNumber: "4",
        splitMode: "equal",
        guestCount: 3,
        preferredMethod: "nequi",
      }),
    );

    const badJsonRes = await POST(
      new Request("http://localhost:9002/api/mesas/4", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{bad-json",
      }),
      { params: Promise.resolve({ mesaId: "4" }) },
    );
    expect(badJsonRes.status).toBe(400);

    const invalidBodyRes = await POST(
      new Request("http://localhost:9002/api/mesas/4", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_round", items: [] }),
      }),
      { params: Promise.resolve({ mesaId: "4" }) },
    );
    expect(invalidBodyRes.status).toBe(422);

    mocks.requestTableBill.mockRejectedValueOnce(
      new mocks.MockBarTabError(404, "No hay una cuenta abierta para esta mesa."),
    );
    const notFoundRes = await POST(
      new Request("http://localhost:9002/api/mesas/99", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_bill", splitMode: "single", guestCount: 1 }),
      }),
      { params: Promise.resolve({ mesaId: "99" }) },
    );
    expect(notFoundRes.status).toBe(404);
  });
});
