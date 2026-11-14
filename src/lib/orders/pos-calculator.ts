import { getProductSizes } from "@/lib/catalog/presentations";
import type { Product, ProductSize } from "@/types/catalog";
import type {
  CheckoutItemInput,
  CreateOrderInput,
  OrderCustomization,
  OrderPaymentBreakdown,
  PosDigitalChannel,
  PosPaymentMethod,
} from "@/types/orders";

export const COP_BILL_DENOMINATIONS = [10_000, 20_000, 50_000, 100_000] as const;

export const POS_DIGITAL_CHANNEL_LABELS: Record<PosDigitalChannel, string> = {
  nequi: "Nequi",
  daviplata: "Daviplata",
  qr: "Código QR",
};

export const POS_PAYMENT_METHOD_LABELS: Record<PosPaymentMethod, string> = {
  efectivo: "Efectivo",
  nequi: "Nequi",
  daviplata: "Daviplata",
  qr: "Código QR",
  mixto: "Cobro Mixto",
};

export type PosCartItem = {
  lineKey: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  customization: OrderCustomization;
};

export type PosPaymentInput = {
  total: number;
  method: PosPaymentMethod;
  cashAmount?: number;
  cashReceived?: number;
  digitalAmount?: number;
  digitalMethod?: PosDigitalChannel;
  digitalReference?: string;
};

export type PosPaymentCalculation = {
  method: PosPaymentMethod;
  total: number;
  cashAmount: number;
  cashReceived: number;
  changeAmount: number;
  digitalAmount: number;
  digitalMethod?: PosDigitalChannel;
  digitalReference?: string;
  coveredAmount: number;
  shortfall: number;
  isValid: boolean;
  validationError?: string;
  breakdown: OrderPaymentBreakdown;
  summaryLabel: string;
};

export type PosOrderDraftInput = {
  items: PosCartItem[];
  serviceType: "pickup" | "mesa";
  tableNumber?: string;
  customerName?: string;
  phone?: string;
  notes?: string;
  payment: PosPaymentCalculation;
};

export type PosOrderPreview = {
  total: number;
  items: Array<{
    productId: string;
    name: string;
    unitPrice: number;
    quantity: number;
    size: string;
  }>;
};

export function sanitizeCopAmount(value: unknown): number {
  if (typeof value === "string") {
    const digitsOnly = value.replace(/[^\d.-]/g, "");
    if (!digitsOnly) return 0;
    const parsed = Number(digitsOnly);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function formatCop(amount: number): string {
  return `$${sanitizeCopAmount(amount).toLocaleString("es-CO")}`;
}

export function getPosProductDefaultSize(
  product: Pick<Product, "availableSizes" | "category" | "price">,
): ProductSize {
  const sizes = getProductSizes(product);
  const preferred16Oz = sizes.find((size) => size.name.trim().toLowerCase() === "16 oz");
  return preferred16Oz ?? sizes[0] ?? { name: "Personal", price: sanitizeCopAmount(product.price) };
}

export function buildPosLineKey(productId: string, customization: OrderCustomization): string {
  const normalizedSize = customization.size.trim().toLowerCase();
  const sortedFlavors = [...customization.flavors].map((item) => item.trim()).sort().join(",");
  const sortedAddOns = [...customization.addOns].map((item) => item.trim()).sort().join(",");
  return `${productId}|${normalizedSize}|${sortedFlavors}|${sortedAddOns}`;
}

export function calculatePosUnitPrice(
  product: Pick<Product, "availableSizes" | "availableAddOns" | "category" | "price">,
  customization: OrderCustomization,
): number {
  const sizes = getProductSizes(product);
  const normalizedSize = customization.size.trim().toLowerCase();
  const matchedSize =
    sizes.find((candidate) => candidate.name.trim().toLowerCase() === normalizedSize) ?? sizes[0];
  const basePrice = sanitizeCopAmount(matchedSize?.price ?? product.price);
  const addOnTotal = customization.addOns.reduce((sum, addOnName) => {
    const found = product.availableAddOns.find((candidate) => candidate.name === addOnName);
    return sum + sanitizeCopAmount(found?.price ?? 0);
  }, 0);

  return basePrice + addOnTotal;
}

export function createPosCartItem(
  product: Product,
  customization?: Partial<OrderCustomization>,
  quantity = 1,
): PosCartItem {
  const defaultSize = getPosProductDefaultSize(product);
  const resolvedCustomization: OrderCustomization = {
    size: customization?.size?.trim() || defaultSize.name,
    flavors: [...(customization?.flavors ?? [])],
    addOns: [...(customization?.addOns ?? [])],
  };
  const safeQuantity = Math.max(1, Math.round(quantity));
  const unitPrice = calculatePosUnitPrice(product, resolvedCustomization);

  return {
    lineKey: buildPosLineKey(product.id, resolvedCustomization),
    productId: product.id,
    name: product.name,
    quantity: safeQuantity,
    unitPrice,
    subtotal: unitPrice * safeQuantity,
    customization: resolvedCustomization,
  };
}

export function calculatePosCartTotal(items: readonly Pick<PosCartItem, "subtotal">[]): number {
  return items.reduce((sum, item) => sum + sanitizeCopAmount(item.subtotal), 0);
}

export function getQuickCashDenominations(cashDue: number): number[] {
  const cleanDue = sanitizeCopAmount(cashDue);
  if (cleanDue <= 0) return [...COP_BILL_DENOMINATIONS];

  const matching = COP_BILL_DENOMINATIONS.filter((bill) => bill >= cleanDue);
  if (matching.length > 0) {
    return [...matching];
  }

  const nextFifty = Math.ceil(cleanDue / 50_000) * 50_000;
  const nextHundred = Math.ceil(cleanDue / 100_000) * 100_000;
  return [...new Set([nextFifty, nextHundred])].sort((a, b) => a - b);
}

/**
 * Balances cash and digital portions in a mixed payment so their sum equals total.
 */
export function balanceMixedPaymentAmounts(
  total: number,
  changedSide: "cash" | "digital",
  rawAmount: number,
): { cashAmount: number; digitalAmount: number } {
  const cleanTotal = sanitizeCopAmount(total);
  const clamped = Math.min(cleanTotal, sanitizeCopAmount(rawAmount));

  if (changedSide === "digital") {
    return {
      digitalAmount: clamped,
      cashAmount: cleanTotal - clamped,
    };
  }

  return {
    cashAmount: clamped,
    digitalAmount: cleanTotal - clamped,
  };
}

export function formatPosPaymentMethodLabel(
  method: PosPaymentMethod,
  digitalMethod?: PosDigitalChannel,
): string {
  if (method === "mixto") {
    const channelLabel = digitalMethod ? POS_DIGITAL_CHANNEL_LABELS[digitalMethod] : "Digital";
    return `Mixto (Efectivo + ${channelLabel})`;
  }
  return POS_PAYMENT_METHOD_LABELS[method];
}

export function formatPosPaymentSummary(
  method: PosPaymentMethod,
  breakdown?: OrderPaymentBreakdown,
): string {
  if (!breakdown) {
    return POS_PAYMENT_METHOD_LABELS[method];
  }

  if (method === "efectivo") {
    const parts = [`Efectivo ${formatCop(breakdown.cashAmount)}`];
    if (breakdown.cashReceived > breakdown.cashAmount) {
      parts.push(`Recibido ${formatCop(breakdown.cashReceived)}`);
      parts.push(`Vueltas ${formatCop(breakdown.changeAmount)}`);
    }
    return parts.join(" · ");
  }

  if (method === "mixto") {
    const digitalLabel = breakdown.digitalMethod
      ? POS_DIGITAL_CHANNEL_LABELS[breakdown.digitalMethod]
      : "Digital";
    const parts = [
      `Mixto: Efectivo ${formatCop(breakdown.cashAmount)} + ${digitalLabel} ${formatCop(breakdown.digitalAmount)}`,
    ];
    if (breakdown.changeAmount > 0) {
      parts.push(`Vueltas ${formatCop(breakdown.changeAmount)}`);
    }
    return parts.join(" · ");
  }

  const channelLabel = POS_PAYMENT_METHOD_LABELS[method];
  const refSuffix = breakdown.digitalReference ? ` (Ref: ${breakdown.digitalReference})` : "";
  return `${channelLabel} ${formatCop(breakdown.digitalAmount)}${refSuffix}`;
}

export function calculatePosPayment(input: PosPaymentInput): PosPaymentCalculation {
  const total = sanitizeCopAmount(input.total);
  const cleanReference = input.digitalReference?.trim() || undefined;

  if (total === 0) {
    const digitalMethod =
      input.method === "nequi" || input.method === "daviplata" || input.method === "qr"
        ? input.method
        : input.method === "mixto"
          ? input.digitalMethod ?? "nequi"
          : undefined;
    const breakdown: OrderPaymentBreakdown = {
      cashAmount: 0,
      cashReceived: 0,
      changeAmount: 0,
      digitalAmount: 0,
      ...(digitalMethod ? { digitalMethod } : {}),
      ...(cleanReference ? { digitalReference: cleanReference } : {}),
    };
    return {
      method: input.method,
      total: 0,
      cashAmount: 0,
      cashReceived: 0,
      changeAmount: 0,
      digitalAmount: 0,
      digitalMethod,
      digitalReference: cleanReference,
      coveredAmount: 0,
      shortfall: 0,
      isValid: true,
      breakdown,
      summaryLabel: formatPosPaymentSummary(input.method, breakdown),
    };
  }

  if (input.method === "efectivo") {
    const cashAmount = total;
    const cashReceived = sanitizeCopAmount(input.cashReceived ?? 0);
    const shortfall = Math.max(0, cashAmount - cashReceived);
    const changeAmount = Math.max(0, cashReceived - cashAmount);
    const isValid = shortfall === 0;
    const breakdown: OrderPaymentBreakdown = {
      cashAmount,
      cashReceived,
      changeAmount,
      digitalAmount: 0,
    };

    return {
      method: "efectivo",
      total,
      cashAmount,
      cashReceived,
      changeAmount,
      digitalAmount: 0,
      coveredAmount: Math.min(total, cashReceived),
      shortfall,
      isValid,
      ...(isValid
        ? {}
        : { validationError: `Faltan ${formatCop(shortfall)} COP en efectivo recibido.` }),
      breakdown,
      summaryLabel: formatPosPaymentSummary("efectivo", breakdown),
    };
  }

  if (input.method === "nequi" || input.method === "daviplata" || input.method === "qr") {
    const breakdown: OrderPaymentBreakdown = {
      cashAmount: 0,
      cashReceived: 0,
      changeAmount: 0,
      digitalAmount: total,
      digitalMethod: input.method,
      ...(cleanReference ? { digitalReference: cleanReference } : {}),
    };

    return {
      method: input.method,
      total,
      cashAmount: 0,
      cashReceived: 0,
      changeAmount: 0,
      digitalAmount: total,
      digitalMethod: input.method,
      digitalReference: cleanReference,
      coveredAmount: total,
      shortfall: 0,
      isValid: true,
      breakdown,
      summaryLabel: formatPosPaymentSummary(input.method, breakdown),
    };
  }

  // Cobro mixto: Efectivo + Nequi / Daviplata / Código QR
  const digitalMethod: PosDigitalChannel = input.digitalMethod ?? "nequi";
  let cashAmount: number;
  let digitalAmount: number;

  if (input.digitalAmount !== undefined && input.cashAmount === undefined) {
    digitalAmount = sanitizeCopAmount(input.digitalAmount);
    cashAmount = Math.max(0, total - digitalAmount);
  } else if (input.cashAmount !== undefined && input.digitalAmount === undefined) {
    cashAmount = sanitizeCopAmount(input.cashAmount);
    digitalAmount = Math.max(0, total - cashAmount);
  } else {
    cashAmount = sanitizeCopAmount(input.cashAmount ?? 0);
    digitalAmount = sanitizeCopAmount(input.digitalAmount ?? 0);
  }

  const cashReceived =
    input.cashReceived === undefined ? cashAmount : sanitizeCopAmount(input.cashReceived);
  const combinedPortions = cashAmount + digitalAmount;
  const changeAmount = Math.max(0, cashReceived - cashAmount);
  const coveredAmount = Math.min(cashAmount, cashReceived) + digitalAmount;
  const shortfall = Math.max(0, total - coveredAmount);

  let validationError: string | undefined;
  if (cashAmount <= 0 || digitalAmount <= 0) {
    validationError =
      "En cobro mixto debes ingresar monto en efectivo y monto digital mayores a $0.";
  } else if (combinedPortions > total) {
    validationError = `La suma de efectivo y ${POS_DIGITAL_CHANNEL_LABELS[digitalMethod]} supera el total del pedido (${formatCop(total)}).`;
  } else if (combinedPortions < total) {
    validationError = `Faltan ${formatCop(total - combinedPortions)} COP para completar el cobro mixto.`;
  } else if (cashReceived < cashAmount) {
    validationError = `Faltan ${formatCop(cashAmount - cashReceived)} COP en el efectivo recibido.`;
  }

  const breakdown: OrderPaymentBreakdown = {
    cashAmount,
    cashReceived,
    changeAmount,
    digitalAmount,
    digitalMethod,
    ...(cleanReference ? { digitalReference: cleanReference } : {}),
  };

  return {
    method: "mixto",
    total,
    cashAmount,
    cashReceived,
    changeAmount,
    digitalAmount,
    digitalMethod,
    digitalReference: cleanReference,
    coveredAmount,
    shortfall,
    isValid: validationError === undefined,
    ...(validationError ? { validationError } : {}),
    breakdown,
    summaryLabel: formatPosPaymentSummary("mixto", breakdown),
  };
}

export function buildPosOrderPayload(input: PosOrderDraftInput): {
  payload: CreateOrderInput;
  preview: PosOrderPreview;
} {
  const cleanTable = input.tableNumber?.trim();
  const normalizedTable = cleanTable
    ? cleanTable.toLowerCase().startsWith("mesa")
      ? cleanTable
      : `Mesa ${cleanTable}`
    : "Mesa";

  const trimmedCustomer = input.customerName?.trim() ?? "";
  const customerName =
    trimmedCustomer.length >= 2
      ? trimmedCustomer
      : input.serviceType === "mesa" && cleanTable
        ? normalizedTable
        : "Cliente Barra";

  const trimmedPhone = input.phone?.trim() ?? "";
  const isValidPhone = trimmedPhone.length >= 7 && /^[+\d()\s-]+$/.test(trimmedPhone);
  const phone = isValidPhone ? trimmedPhone : "3000000000";

  const address =
    input.serviceType === "mesa"
      ? `${normalizedTable} - Consumo en local`
      : "Barra Principal - Pedido POS";

  const items: CheckoutItemInput[] = input.items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    customization: {
      size: item.customization.size,
      flavors: [...item.customization.flavors],
      addOns: [...item.customization.addOns],
    },
  }));

  const trimmedNotes = input.notes?.trim();

  const payload: CreateOrderInput = {
    customerName,
    phone,
    address,
    serviceType: input.serviceType,
    ...(input.serviceType === "mesa" && cleanTable ? { tableNumber: cleanTable } : {}),
    ...(trimmedNotes ? { notes: trimmedNotes } : {}),
    items,
    paymentMethod: input.payment.method,
    paymentBreakdown: input.payment.breakdown,
  };

  const preview: PosOrderPreview = {
    total: calculatePosCartTotal(input.items),
    items: input.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      size: item.customization.size,
    })),
  };

  return { payload, preview };
}
