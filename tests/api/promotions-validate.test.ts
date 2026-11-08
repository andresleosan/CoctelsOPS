import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyRequest, getProductById, getPromotionByCode } = vi.hoisted(() => ({
  verifyRequest: vi.fn(),
  getProductById: vi.fn(),
  getPromotionByCode: vi.fn(),
}));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyRequest,
  AuthorizationError: class AuthorizationError extends Error {
    readonly status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  toAuthorizationResponse: (error: Error & { status?: number }) =>
    Response.json({ error: error.message }, { status: error.status ?? 500 }),
}));

vi.mock("@/lib/firestore/products", () => ({ getProductById }));
vi.mock("@/lib/firestore/promotions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firestore/promotions")>(
    "@/lib/firestore/promotions"
  );
  return {
    ...actual,
    getPromotionByCode,
  };
});

import { POST } from "@/app/api/promotions/validate/route";

const sampleProduct = {
  id: "fresa",
  name: "Granizado de Fresa",
  description: "Granizado natural",
  price: 15000,
  image: "/catalog-placeholder.svg",
  category: "granizado" as const,
  availableSizes: [
    { name: "8 oz", price: 10000 },
    { name: "16 oz", price: 15000 },
    { name: "24 oz", price: 25000 },
  ],
  availableFlavors: ["Fresa", "Mango"],
  availableAddOns: [{ name: "Gomitas", price: 2000 }],
  stock: 20,
  active: true,
  featured: true,
};

const activePromotion = {
  id: "promo-fiesta",
  code: "FIESTA20",
  active: true,
  startsAt: "2020-01-01T00:00:00.000Z",
  endsAt: "2099-12-31T23:59:59.999Z",
  discountType: "percent" as const,
  discountValue: 20,
  minimumSubtotal: 20000,
  usageLimit: 50,
  usageCount: 3,
  maxDiscount: 10000,
};

describe("POST /api/promotions/validate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyRequest.mockResolvedValue({ uid: "customer-1" });
    getProductById.mockResolvedValue(sampleProduct);
    getPromotionByCode.mockResolvedValue(activePromotion);
  });

  it("recalculates subtotal on server and returns applied discount ignoring client prices", async () => {
    const response = await POST(
      new Request("http://localhost/api/promotions/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: "fiesta20",
          items: [
            {
              productId: "fresa",
              quantity: 2,
              customization: { size: "16 oz", flavors: ["Fresa"], addOns: ["Gomitas"] },
              price: 100, // intento de manipulación desde cliente
            },
          ],
          subtotal: 200, // intento de manipulación desde cliente
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(verifyRequest).toHaveBeenCalled();
    expect(getPromotionByCode).toHaveBeenCalledWith("FIESTA20");

    // 2 x (15.000 + 2.000) = 34.000 subtotal real en servidor -> 20% = 6.800 descuento -> total 27.200
    await expect(response.json()).resolves.toEqual({
      applied: true,
      code: "FIESTA20",
      discountType: "percent",
      discountValue: 20,
      subtotal: 34000,
      discount: 6800,
      total: 27200,
    });
  });

  it("returns 422 when promotion code does not exist", async () => {
    getPromotionByCode.mockResolvedValueOnce(null);

    const response = await POST(
      new Request("http://localhost/api/promotions/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: "NOEXISTE",
          items: [
            {
              productId: "fresa",
              quantity: 2,
              customization: { size: "16 oz", flavors: [], addOns: [] },
            },
          ],
        }),
      })
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      applied: false,
      error: expect.stringMatching(/no existe/i),
    });
  });

  it("returns 422 with minimum subtotal message when order does not meet minimumSubtotal", async () => {
    const response = await POST(
      new Request("http://localhost/api/promotions/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: "FIESTA20",
          items: [
            {
              productId: "fresa",
              quantity: 1,
              customization: { size: "8 oz", flavors: [], addOns: [] }, // $10.000 < $20.000 mínimo
            },
          ],
        }),
      })
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      applied: false,
      reason: "mínimo",
      error: expect.stringMatching(/compra mínima/i),
    });
  });

  it("returns 422 when promotion is expired or usage limit is reached", async () => {
    getPromotionByCode.mockResolvedValueOnce({
      ...activePromotion,
      usageLimit: 5,
      usageCount: 5,
    });

    const response = await POST(
      new Request("http://localhost/api/promotions/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: "FIESTA20",
          items: [
            {
              productId: "fresa",
              quantity: 2,
              customization: { size: "16 oz", flavors: [], addOns: [] },
            },
          ],
        }),
      })
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      applied: false,
      reason: "límite",
      error: expect.stringMatching(/límite máximo/i),
    });
  });
});
