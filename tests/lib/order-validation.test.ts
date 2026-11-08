import { describe, expect, it } from "vitest";

import {
  calculateOrder,
  createOrderInputSchema,
  assertOrderOwnership,
  assertValidTransition,
  resolvePresentationPrice,
} from "@/lib/validation/orders";
import { getOrderAction } from "@/lib/orders/status-actions";
import type { Product } from "@/types/catalog";

const product: Product = {
  id: "fresa",
  name: "Fresa Salvaje",
  description: "Granizado de fresa.",
  price: 10000,
  image: "/catalog-placeholder.svg",
  category: "granizado",
  availableFlavors: ["Fresa", "Mango"],
  availableAddOns: [{ name: "Gomitas", price: 1500 }],
  stock: 10,
  active: true,
  featured: false,
};

const productWithCanvaSizes: Product = {
  ...product,
  availableSizes: [
    { name: "8 oz", price: 10000 },
    { name: "16 oz", price: 15000 },
    { name: "24 oz", price: 25000 },
  ],
};

const validInput = {
  customerName: "Ana Perez",
  phone: "324 555 0000",
  address: "Carrera 37 # 66-36",
  notes: "Timbre azul",
  items: [
    {
      productId: "fresa",
      quantity: 1,
      price: 1,
      name: "Producto falsificado",
      customization: { size: "Medium", flavors: ["Fresa"], addOns: ["Gomitas"] },
    },
  ],
  total: 1,
  status: "entregado",
  clienteUid: "attacker",
};

describe("order validation", () => {
  it("rejects an empty cart and incomplete delivery details", () => {
    expect(() => createOrderInputSchema.parse({ ...validInput, items: [] })).toThrow();
    expect(() => createOrderInputSchema.parse({ ...validInput, customerName: "" })).toThrow();
    expect(() => createOrderInputSchema.parse({ ...validInput, phone: "" })).toThrow();
    expect(() => createOrderInputSchema.parse({ ...validInput, address: "" })).toThrow();
  });

  it("rejects invalid quantities and unknown promotions", () => {
    expect(() => createOrderInputSchema.parse({ ...validInput, items: [{ ...validInput.items[0], quantity: 0 }] })).toThrow();
    expect(() => createOrderInputSchema.parse({ ...validInput, promotionCode: "NO_EXISTE" })).toThrow();
  });

  it("accepts valid serviceType and tableNumber for on-premise table or pickup orders", () => {
    const tableOrder = createOrderInputSchema.parse({
      ...validInput,
      serviceType: "mesa",
      tableNumber: "Mesa 4",
      address: "Mesa 4 - Consumo en local",
    });
    expect(tableOrder.serviceType).toBe("mesa");
    expect(tableOrder.tableNumber).toBe("Mesa 4");

    const pickupOrder = createOrderInputSchema.parse({
      ...validInput,
      serviceType: "pickup",
      address: "Recoger en Barra - Consumo en local",
    });
    expect(pickupOrder.serviceType).toBe("pickup");

    expect(() =>
      createOrderInputSchema.parse({
        ...validInput,
        serviceType: "invalid-service",
      })
    ).toThrow();
  });

  it("uses the active product catalog instead of client prices or names", () => {
    const order = calculateOrder(createOrderInputSchema.parse(validInput), [product]);

    expect(order.total).toBe(11500);
    expect(order.items[0]).toMatchObject({
      productId: "fresa",
      name: "Fresa Salvaje",
      unitPrice: 11500,
      subtotal: 11500,
    });
    expect(order.items[0]).not.toHaveProperty("price", 1);
  });

  it("calculates real Canva presentation prices without multipliers", () => {
    // 8 oz ($10.000) + Gomitas ($1.500) = $11.500
    const order8oz = calculateOrder(createOrderInputSchema.parse({
      ...validInput,
      items: [{ ...validInput.items[0], customization: { size: "8 oz", flavors: ["Fresa"], addOns: ["Gomitas"] } }],
    }), [productWithCanvaSizes]);
    expect(order8oz.items[0].unitPrice).toBe(11500);
    expect(order8oz.total).toBe(11500);

    // 16 oz ($15.000) sin adiciones = $15.000
    const order16oz = calculateOrder(createOrderInputSchema.parse({
      ...validInput,
      items: [{ ...validInput.items[0], customization: { size: "16 oz", flavors: ["Fresa"], addOns: [] } }],
    }), [productWithCanvaSizes]);
    expect(order16oz.items[0].unitPrice).toBe(15000);
    expect(order16oz.total).toBe(15000);

    // 24 oz ($25.000) + Gomitas ($1.500) = $26.500 (No 10.000 * 1.3!)
    const order24oz = calculateOrder(createOrderInputSchema.parse({
      ...validInput,
      items: [{ ...validInput.items[0], customization: { size: "24 oz", flavors: ["Fresa"], addOns: ["Gomitas"] }, price: 50 }],
    }), [productWithCanvaSizes]);
    expect(order24oz.items[0].unitPrice).toBe(26500);
    expect(order24oz.total).toBe(26500);
    expect(order24oz.items[0]).not.toHaveProperty("price", 50);

    // Verificación unitaria de resolvePresentationPrice
    expect(resolvePresentationPrice(productWithCanvaSizes, "8 oz")).toBe(10000);
    expect(resolvePresentationPrice(productWithCanvaSizes, "16 oz")).toBe(15000);
    expect(resolvePresentationPrice(productWithCanvaSizes, "24 oz")).toBe(25000);
  });

  it("rejects unavailable presentations/sizes on products with explicit availableSizes", () => {
    expect(() => calculateOrder(createOrderInputSchema.parse({
      ...validInput,
      items: [{ ...validInput.items[0], customization: { size: "32 oz", flavors: ["Fresa"], addOns: [] } }],
    }), [productWithCanvaSizes])).toThrow(/tamaño|presentación/i);
  });

  it("rejects empty size string", () => {
    expect(() => createOrderInputSchema.parse({
      ...validInput,
      items: [{ ...validInput.items[0], customization: { size: "", flavors: ["Fresa"], addOns: [] } }],
    })).toThrow();
  });

  it("rejects unknown and inactive products", () => {
    expect(() => calculateOrder(createOrderInputSchema.parse(validInput), [])).toThrow(/producto/i);
    expect(() => calculateOrder(createOrderInputSchema.parse(validInput), [{ ...product, active: false }])).toThrow(/activo/i);
  });

  it("rejects unavailable customizations and quantities over stock", () => {
    expect(() => calculateOrder(createOrderInputSchema.parse({
      ...validInput,
      items: [{ ...validInput.items[0], customization: { size: "Medium", flavors: ["Lulo"], addOns: [] } }],
    }), [product])).toThrow(/sabor/i);
    expect(() => calculateOrder(createOrderInputSchema.parse({
      ...validInput,
      items: [{ ...validInput.items[0], quantity: 11 }],
    }), [product])).toThrow(/disponible|stock/i);
  });

  it("rejects aggregate quantity over stock across repeated product lines", () => {
    expect(() => calculateOrder(createOrderInputSchema.parse({
      ...validInput,
      items: [
        { ...validInput.items[0], quantity: 6 },
        { ...validInput.items[0], quantity: 6 },
      ],
    }), [product])).toThrow(/disponible|stock/i);
  });

  it("rejects customer reads for another user", () => {
    expect(() => assertOrderOwnership({ uid: "customer-1" } as never, "customer-2")).toThrow(/permiso/i);
  });

  it("allows only the defined order state transitions", () => {
    expect(() => assertValidTransition("pendiente", "confirmado")).not.toThrow();
    expect(() => assertValidTransition("pendiente", "preparando")).toThrow(/transicion/i);
    expect(() => assertValidTransition("entregado", "cancelado")).toThrow(/transicion/i);
    expect(() => assertValidTransition("desconocido" as never, "confirmado")).toThrow(/transicion/i);
  });

  it("labels dashboard actions with their actual next state", () => {
    expect(getOrderAction("preparando")).toEqual({ nextStatus: "en_camino", label: "ENVIAR" });
    expect(getOrderAction("en_camino")).toEqual({ nextStatus: "entregado", label: "ENTREGADO" });
  });
});
