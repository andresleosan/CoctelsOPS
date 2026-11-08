import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyRequest, rateCustomerOrder, OrderNotFoundError } = vi.hoisted(() => ({
  verifyRequest: vi.fn(),
  rateCustomerOrder: vi.fn(),
  OrderNotFoundError: class OrderNotFoundError extends Error {
    readonly status = 404;
    constructor() {
      super("Pedido no encontrado");
      this.name = "OrderNotFoundError";
    }
  },
}));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyRequest,
  toAuthorizationResponse: (error: Error & { status?: number }) =>
    Response.json({ error: error.message }, { status: error.status ?? 500 }),
}));

vi.mock("@/lib/firestore/orders", () => ({
  rateCustomerOrder,
  OrderNotFoundError,
}));

import { POST as POST_RATING } from "@/app/api/pedidos/[id]/rating/route";

describe("POST /api/pedidos/[id]/rating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyRequest.mockResolvedValue({ uid: "customer-1" });
    rateCustomerOrder.mockResolvedValue({
      stars: 5,
      tags: ["🍓 Sabor increíble", "❄️ Bien frío"],
      comment: "Delicioso!",
      createdAt: "2026-11-07T22:00:00.000Z",
    });
  });

  it("permite calificar un pedido entregado con 5 estrellas, tags y comentario", async () => {
    const response = await POST_RATING(
      new Request("http://localhost/api/pedidos/ord-123/rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stars: 5,
          tags: ["🍓 Sabor increíble", "❄️ Bien frío"],
          comment: "Delicioso!",
        }),
      }),
      { params: Promise.resolve({ id: "ord-123" }) }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.rating.stars).toBe(5);
    expect(rateCustomerOrder).toHaveBeenCalledWith(
      { uid: "customer-1" },
      "ord-123",
      expect.objectContaining({
        stars: 5,
        tags: ["🍓 Sabor increíble", "❄️ Bien frío"],
        comment: "Delicioso!",
      })
    );
  });

  it("falla con 422 si las estrellas son menores a 1 o mayores a 5", async () => {
    const responseZero = await POST_RATING(
      new Request("http://localhost/api/pedidos/ord-123/rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stars: 0 }),
      }),
      { params: Promise.resolve({ id: "ord-123" }) }
    );
    expect(responseZero.status).toBe(422);

    const responseSix = await POST_RATING(
      new Request("http://localhost/api/pedidos/ord-123/rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stars: 6 }),
      }),
      { params: Promise.resolve({ id: "ord-123" }) }
    );
    expect(responseSix.status).toBe(422);
  });

  it("retorna 404 si el pedido no existe", async () => {
    rateCustomerOrder.mockRejectedValueOnce(new OrderNotFoundError());

    const response = await POST_RATING(
      new Request("http://localhost/api/pedidos/ord-inexistente/rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stars: 4 }),
      }),
      { params: Promise.resolve({ id: "ord-inexistente" }) }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Pedido no encontrado");
  });

  it("retorna 422 si el cuerpo de la solicitud no es JSON válido", async () => {
    const response = await POST_RATING(
      new Request("http://localhost/api/pedidos/ord-123/rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid-json",
      }),
      { params: Promise.resolve({ id: "ord-123" }) }
    );

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error).toContain("JSON");
  });
});
