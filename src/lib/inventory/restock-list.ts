import { calculateSupplyStatus, type SupplyItem, type SupplyStatus } from "@/types/supplies";

export type RestockPriority = Extract<SupplyStatus, "critico" | "bajo">;

export type RestockItem = {
  supply: SupplyItem;
  priority: RestockPriority;
  currentStock: number;
  minStock: number;
  targetStock: number;
  deficit: number;
  suggestedQuantity: number;
  estimatedCostCop: number;
};

export type SupplierRestockGroup = {
  supplier: string;
  items: RestockItem[];
  criticosCount: number;
  bajosCount: number;
  totalEstimatedCop: number;
};

export type RestockSummary = {
  totalItems: number;
  criticosCount: number;
  bajosCount: number;
  totalEstimatedCop: number;
  groups: SupplierRestockGroup[];
};

export type BuildRestockOptions = {
  targetMultiplier?: number;
};

const DEFAULT_SUPPLIER_LABEL = "Proveedor General";

function roundQuantityByUnit(rawQty: number, unit: SupplyItem["unit"]): number {
  if (rawQty <= 0) return 0;
  if (unit === "l" || unit === "kg") {
    const rounded = Math.ceil(rawQty * 10) / 10;
    return rounded < 1 ? Math.max(0.5, rounded) : Math.ceil(rounded);
  }
  return Math.max(1, Math.ceil(rawQty));
}

/**
 * Calcula la cantidad sugerida de reposición para llevar el insumo
 * a un nivel objetivo (por defecto 2x el stock mínimo).
 */
export function calculateSuggestedRestockQuantity(
  item: Pick<SupplyItem, "currentStock" | "minStock" | "unit">,
  targetMultiplier = 2
): { targetStock: number; deficit: number; suggestedQuantity: number } {
  const safeMultiplier = Number.isFinite(targetMultiplier) && targetMultiplier >= 1 ? targetMultiplier : 2;
  const effectiveCurrent = Math.max(0, Number.isFinite(item.currentStock) ? item.currentStock : 0);
  const safeMin = Math.max(0, Number.isFinite(item.minStock) ? item.minStock : 0);

  const targetStock = safeMin > 0 ? Math.ceil(safeMin * safeMultiplier) : 1;
  const rawDeficit = Math.max(0, targetStock - effectiveCurrent);
  const suggestedQuantity = roundQuantityByUnit(rawDeficit > 0 ? rawDeficit : 1, item.unit);

  return {
    targetStock,
    deficit: Number(rawDeficit.toFixed(2)),
    suggestedQuantity,
  };
}

/**
 * Construye la lista de compras automática agrupada por proveedor
 * a partir de los insumos en estado "critico" o "bajo".
 */
export function buildRestockList(
  supplies: SupplyItem[],
  options: BuildRestockOptions = {}
): RestockSummary {
  const { targetMultiplier = 2 } = options;

  const restockItems: RestockItem[] = [];

  for (const supply of supplies) {
    const status = calculateSupplyStatus(supply.currentStock, supply.minStock);
    if (status === "ok") continue;

    const { targetStock, deficit, suggestedQuantity } = calculateSuggestedRestockQuantity(
      supply,
      targetMultiplier
    );
    const unitCost = Number.isFinite(supply.costPerUnit) && supply.costPerUnit > 0 ? supply.costPerUnit : 0;
    const estimatedCostCop = Math.round(suggestedQuantity * unitCost);

    restockItems.push({
      supply,
      priority: status,
      currentStock: supply.currentStock,
      minStock: supply.minStock,
      targetStock,
      deficit,
      suggestedQuantity,
      estimatedCostCop,
    });
  }

  // Ordenar: críticos primero, luego bajos, luego alfabético
  restockItems.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority === "critico" ? -1 : 1;
    }
    return a.supply.name.localeCompare(b.supply.name, "es");
  });

  const groupMap = new Map<string, RestockItem[]>();
  for (const item of restockItems) {
    const supplierName = item.supply.supplier?.trim() || DEFAULT_SUPPLIER_LABEL;
    const list = groupMap.get(supplierName) ?? [];
    list.push(item);
    groupMap.set(supplierName, list);
  }

  const groups: SupplierRestockGroup[] = Array.from(groupMap.entries()).map(([supplier, items]) => {
    const criticosCount = items.filter((i) => i.priority === "critico").length;
    const bajosCount = items.filter((i) => i.priority === "bajo").length;
    const totalEstimatedCop = items.reduce((sum, i) => sum + i.estimatedCostCop, 0);
    return {
      supplier,
      items,
      criticosCount,
      bajosCount,
      totalEstimatedCop,
    };
  });

  groups.sort((a, b) => {
    if (a.criticosCount !== b.criticosCount) return b.criticosCount - a.criticosCount;
    if (a.bajosCount !== b.bajosCount) return b.bajosCount - a.bajosCount;
    return a.supplier.localeCompare(b.supplier, "es");
  });

  return {
    totalItems: restockItems.length,
    criticosCount: restockItems.filter((i) => i.priority === "critico").length,
    bajosCount: restockItems.filter((i) => i.priority === "bajo").length,
    totalEstimatedCop: groups.reduce((sum, g) => sum + g.totalEstimatedCop, 0),
    groups,
  };
}

/**
 * Formatea un mensaje de orden de compra listo para enviar por WhatsApp a un proveedor.
 */
export function formatSupplierWhatsAppMessage(
  group: SupplierRestockGroup,
  options: {
    storeName?: string;
    customQuantities?: Record<string, number>;
  } = {}
): string {
  const { storeName = "Coctels OPS", customQuantities = {} } = options;

  const lines: string[] = [
    `Hola *${group.supplier}*, buen día 👋`,
    `Te comparto nuestra orden de reposición para *${storeName}*:`,
    "",
  ];

  let totalEstimated = 0;

  for (const item of group.items) {
    const qty = customQuantities[item.supply.id] ?? item.suggestedQuantity;
    if (qty <= 0) continue;

    const unitCost = item.supply.costPerUnit > 0 ? item.supply.costPerUnit : 0;
    totalEstimated += Math.round(qty * unitCost);
    const urgencyTag = item.priority === "critico" ? " [URGENTE]" : "";
    lines.push(`• *${qty} ${item.supply.unit}* — ${item.supply.name}${urgencyTag}`);
  }

  lines.push("");
  if (totalEstimated > 0) {
    lines.push(`💰 Presupuesto estimado: $${totalEstimated.toLocaleString("es-CO")} COP`);
  }
  lines.push("Por favor confírmanos disponibilidad y hora de entrega. ¡Gracias!");

  return lines.join("\n");
}

function normalizeWhatsAppPhone(rawPhone?: string): string {
  if (!rawPhone) return "";
  const digits = rawPhone.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("3")) {
    return `57${digits}`;
  }
  if (digits.length >= 7 && digits.length <= 15) {
    return digits;
  }
  return "";
}

/**
 * Construye el enlace wa.me para enviar la orden en 1 tap por WhatsApp.
 * Si no se especifica teléfono, abre el selector de contacto de WhatsApp con el texto prellenado.
 */
export function buildWhatsAppShareUrl(message: string, phone?: string): string {
  const cleanPhone = normalizeWhatsAppPhone(phone);
  const encodedText = encodeURIComponent(message);
  return cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodedText}`
    : `https://wa.me/?text=${encodedText}`;
}
