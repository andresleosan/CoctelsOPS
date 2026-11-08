import { z } from "zod";

import { AuthorizationError } from "@/lib/auth/verify-request";
import type { Product } from "@/types/catalog";
import type { CreateOrderInput, OrderItem, OrderStatus } from "@/types/orders";

export class OrderValidationError extends Error {
  readonly status = 422;

  constructor(message: string) {
    super(message);
    this.name = "OrderValidationError";
  }
}

const customizationSchema = z.object({
  size: z.string().trim().min(1, "El tamaño es obligatorio").max(50),
  flavors: z.array(z.string().trim().min(1)).max(20),
  addOns: z.array(z.string().trim().min(1)).max(20),
});

export const createOrderInputSchema = z.object({
  customerName: z.string().trim().min(2, "El nombre es obligatorio").max(120),
  phone: z.string().trim().min(7, "El telefono es obligatorio").max(30).regex(/^[+\d()\s-]+$/, "El telefono no es valido"),
  address: z.string().trim().min(5, "La direccion es obligatoria").max(240),
  notes: z.string().trim().max(500).optional(),
  serviceType: z.enum(["delivery", "mesa", "pickup"]).optional(),
  tableNumber: z.string().trim().max(50).optional(),
  items: z.array(z.object({
    productId: z.string().trim().min(1),
    quantity: z.number().int().min(1).max(50),
    customization: customizationSchema,
  })).min(1, "El carrito no puede estar vacio").max(50),
  promotionCode: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9-]+$/, "El código de promoción no es válido").optional(),
});

export const statusUpdateSchema = z.object({
  status: z.enum(["pendiente", "confirmado", "preparando", "en_camino", "entregado", "cancelado"]),
  reason: z.string().trim().max(240).optional(),
});

export const allowedTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  pendiente: ["confirmado", "cancelado"],
  confirmado: ["preparando", "cancelado"],
  preparando: ["en_camino", "cancelado"],
  en_camino: ["entregado", "cancelado"],
  entregado: [],
  cancelado: [],
};

export function assertValidTransition(current: OrderStatus, next: OrderStatus): void {
  if (!allowedTransitions[current] || !allowedTransitions[current].includes(next)) {
    throw new OrderValidationError(`Transicion no permitida: ${current} -> ${next}`);
  }
}

export function assertOrderOwnership(user: { uid: string }, clienteUid: string): void {
  if (user.uid !== clienteUid) {
    throw new AuthorizationError(403, "No tienes permiso para acceder a este pedido");
  }
}

type CalculatedOrder = {
  items: OrderItem[];
  subtotal: number;
  total: number;
};

function assertDistinct(values: string[], message: string): void {
  if (new Set(values).size !== values.length) throw new OrderValidationError(message);
}

/**
 * Resuelve el precio exacto en COP de una presentación o tamaño configurado en el servidor.
 * Descarta multiplicadores ficticios y garantiza integridad frente a alteraciones en cliente.
 */
export function resolvePresentationPrice(product: Product, size: string): number {
  const normalizedSize = size.trim().toLowerCase();

  // 1. Si el producto define presentaciones explícitas en el catálogo:
  if (product.availableSizes && product.availableSizes.length > 0) {
    const matched = product.availableSizes.find(
      (s) => s.name.trim().toLowerCase() === normalizedSize
    );
    if (matched) return matched.price;

    // Mapeo retrocompatible para pedidos legacy con "Small", "Medium" o "Large"
    if (normalizedSize === "small" || normalizedSize === "pequeño") {
      return product.availableSizes[0].price;
    }
    if (normalizedSize === "medium" || normalizedSize === "mediano") {
      const midIndex = Math.min(1, product.availableSizes.length - 1);
      return product.availableSizes[midIndex].price;
    }
    if (normalizedSize === "large" || normalizedSize === "grande") {
      return product.availableSizes[product.availableSizes.length - 1].price;
    }

    throw new OrderValidationError(`El tamaño o presentación "${size}" no está disponible`);
  }

  // 2. Si el producto NO define availableSizes (producto heredado):
  if (product.category === "granizado") {
    if (normalizedSize === "8 oz" || normalizedSize === "8oz") return 10000;
    if (normalizedSize === "16 oz" || normalizedSize === "16oz") return 15000;
    if (normalizedSize === "24 oz" || normalizedSize === "24oz") return 25000;
  }
  if (product.category === "cocktail") {
    if (normalizedSize === "14 oz" || normalizedSize === "14oz") return 15000;
  }

  const isAcceptedLegacy = ["small", "medium", "large", "estándar", "estandar", "personal", "única", "unica"].includes(normalizedSize);
  if (isAcceptedLegacy) {
    return product.price;
  }

  if (product.price > 0 && normalizedSize.length > 0) {
    return product.price;
  }

  throw new OrderValidationError(`El tamaño o presentación "${size}" no está disponible`);
}

export function calculateOrder(input: CreateOrderInput, products: Product[]): CalculatedOrder {
  const quantities = new Map<string, number>();
  for (const item of input.items) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }
  for (const [productId, quantity] of quantities) {
    const product = products.find((candidate) => candidate.id === productId);
    if (product && quantity > product.stock) throw new OrderValidationError("La cantidad supera el stock disponible");
  }

  const items = input.items.map((item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    if (!product) throw new OrderValidationError("Producto no encontrado");
    if (!product.active) throw new OrderValidationError("El producto no esta activo");

    const { flavors, addOns, size } = item.customization;
    assertDistinct(flavors, "No se pueden repetir sabores");
    assertDistinct(addOns, "No se pueden repetir adiciones");
    if (flavors.some((flavor) => !product.availableFlavors.includes(flavor))) {
      throw new OrderValidationError("El sabor no esta disponible");
    }

    const selectedAddOns = addOns.map((name) => {
      const addOn = product.availableAddOns.find((candidate) => candidate.name === name);
      if (!addOn) throw new OrderValidationError("La adicion no esta disponible");
      return addOn;
    });

    const presentationPrice = resolvePresentationPrice(product, size);
    const unitPrice = presentationPrice + selectedAddOns.reduce((sum, addOn) => sum + addOn.price, 0);

    return {
      productId: product.id,
      name: product.name,
      quantity: item.quantity,
      unitPrice,
      subtotal: unitPrice * item.quantity,
      customization: item.customization,
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  return { items, subtotal, total: subtotal };
}
