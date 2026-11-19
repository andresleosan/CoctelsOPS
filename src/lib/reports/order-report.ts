import "server-only";

import { z } from "zod";

import { getAdminDb } from "@/lib/firebase-admin";
import { getCatalogProfitability } from "@/lib/firestore/recipes";
import { normalizePresentationKey } from "@/lib/recipes/escandallo";
import { classifyMarginHealth } from "@/lib/recipes/profitability";
import type { OrderReport, OrderReportFilter, ReportOrder } from "@/types/operations";
import type {
  OrderEscandalloItemCost,
  OrderEscandalloSummary,
  OrderProfitabilitySummary,
  PeriodCocktailProfitabilityItem,
} from "@/types/recipes";
import { DEFAULT_TENANT_ID } from "@/types/tenant";

export const orderReportFilterSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  status: z.enum(["pendiente", "confirmado", "preparando", "en_camino", "entregado", "cancelado"]).optional(),
}).superRefine((filter, context) => {
  if (filter.from && filter.to && filter.from > filter.to) context.addIssue({ code: z.ZodIssueCode.custom, path: ["from"], message: "La fecha inicial no puede superar la fecha final" });
});

export function aggregateOrders(orders: ReportOrder[]): OrderReport {
  const revenueByStatus: Record<string, number> = {};
  const productMap = new Map<string, { quantity: number; revenue: number }>();
  const customerMap = new Map<string, { orders: number; revenue: number }>();
  const cocktailMap = new Map<
    string,
    {
      productId: string;
      productName: string;
      presentation: string;
      recipeId?: string;
      unitsSold: number;
      revenueCop: number;
      totalCostCop: number;
    }
  >();
  let cancellationCount = 0;
  let totalRevenue = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  let totalEligibleOrderCount = 0;
  let coveredOrderCount = 0;
  let periodRevenueCop = 0;
  let periodCostCop = 0;

  for (const order of orders) {
    totalRevenue += order.total;
    if (order.rating && order.rating >= 1 && order.rating <= 5) {
      ratingSum += order.rating;
      ratingCount += 1;
    }
    revenueByStatus[order.status] = (revenueByStatus[order.status] ?? 0) + order.total;
    if (order.status === "cancelado") {
      cancellationCount += 1;
    } else {
      totalEligibleOrderCount += 1;
      if (order.escandallo && order.escandallo.items.length > 0) {
        const coveredItems = order.escandallo.items.filter((item) => Boolean(item.recipeId));
        if (coveredItems.length > 0) {
          coveredOrderCount += 1;
          for (const item of coveredItems) {
            periodRevenueCop += item.subtotalCop;
            periodCostCop += item.totalCostCop;
            const key = `${item.productId}::${normalizePresentationKey(item.presentation)}`;
            const existing = cocktailMap.get(key) ?? {
              productId: item.productId,
              productName: item.productName,
              presentation: item.presentation,
              recipeId: item.recipeId,
              unitsSold: 0,
              revenueCop: 0,
              totalCostCop: 0,
            };
            existing.unitsSold += item.quantity;
            existing.revenueCop += item.subtotalCop;
            existing.totalCostCop += item.totalCostCop;
            if (!existing.recipeId && item.recipeId) {
              existing.recipeId = item.recipeId;
            }
            cocktailMap.set(key, existing);
          }
        }
      }
    }

    const customer = customerMap.get(order.customerId) ?? { orders: 0, revenue: 0 };
    customer.orders += 1;
    customer.revenue += order.total;
    customerMap.set(order.customerId, customer);
    for (const item of order.items) {
      const product = productMap.get(item.name) ?? { quantity: 0, revenue: 0 };
      product.quantity += item.quantity;
      product.revenue += item.subtotal;
      productMap.set(item.name, product);
    }
  }

  const topProducts = [...productMap.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
  const topCustomers = [...customerMap.entries()].sort(([, left], [, right]) => right.revenue - left.revenue).map(([, value], index) => ({ customerBucket: `Cliente ${index + 1}`, ...value }));
  const csat = ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(1)) : undefined;

  let profitability: OrderProfitabilitySummary | undefined;
  if (coveredOrderCount > 0) {
    const cocktails: PeriodCocktailProfitabilityItem[] = [...cocktailMap.values()]
      .map((entry) => {
        const grossProfitCop = entry.revenueCop - entry.totalCostCop;
        const grossMarginPct =
          entry.revenueCop > 0
            ? Number(((grossProfitCop / entry.revenueCop) * 100).toFixed(1))
            : 0;
        return {
          productId: entry.productId,
          productName: entry.productName,
          presentation: entry.presentation,
          ...(entry.recipeId ? { recipeId: entry.recipeId } : {}),
          unitsSold: entry.unitsSold,
          revenueCop: Math.round(entry.revenueCop),
          totalCostCop: Math.round(entry.totalCostCop),
          grossProfitCop: Math.round(grossProfitCop),
          grossMarginPct,
          unitCostCop: entry.unitsSold > 0 ? Math.round(entry.totalCostCop / entry.unitsSold) : 0,
          averagePriceCop: entry.unitsSold > 0 ? Math.round(entry.revenueCop / entry.unitsSold) : 0,
          health: classifyMarginHealth(grossMarginPct),
        };
      })
      .sort((a, b) => a.grossMarginPct - b.grossMarginPct || b.revenueCop - a.revenueCop);

    const grossProfitCop = Math.round(periodRevenueCop - periodCostCop);
    const grossMarginPct =
      periodRevenueCop > 0 ? Number(((grossProfitCop / periodRevenueCop) * 100).toFixed(1)) : 0;

    profitability = {
      coveredOrderCount,
      totalEligibleOrderCount,
      revenueCop: Math.round(periodRevenueCop),
      totalCostCop: Math.round(periodCostCop),
      grossProfitCop,
      grossMarginPct,
      cocktails,
      lowMarginAlerts: cocktails.filter((item) => item.health !== "saludable"),
    };
  }

  return {
    orderCount: orders.length,
    totalRevenue,
    revenueByStatus,
    topProducts,
    topCustomers,
    cancellationCount,
    ...(csat !== undefined ? { csat, ratingCount } : {}),
    ...(profitability ? { profitability } : {}),
  };
}

function parseEscandalloSummary(raw: unknown): OrderEscandalloSummary | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const data = raw as Record<string, unknown>;
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items: OrderEscandalloItemCost[] = rawItems.flatMap((entry): OrderEscandalloItemCost[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const productId = typeof item.productId === "string" ? item.productId.trim() : "";
    const productName = typeof item.productName === "string" ? item.productName.trim() : "Producto";
    const presentation = typeof item.presentation === "string" ? item.presentation.trim() : "*";
    const quantity = typeof item.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : 0;
    const unitPriceCop =
      typeof item.unitPriceCop === "number" && Number.isFinite(item.unitPriceCop) ? item.unitPriceCop : 0;
    const subtotalCop =
      typeof item.subtotalCop === "number" && Number.isFinite(item.subtotalCop) ? item.subtotalCop : 0;
    const recipeId = typeof item.recipeId === "string" && item.recipeId.trim() ? item.recipeId.trim() : undefined;
    const unitCostCop =
      typeof item.unitCostCop === "number" && Number.isFinite(item.unitCostCop) ? item.unitCostCop : 0;
    const totalCostCop =
      typeof item.totalCostCop === "number" && Number.isFinite(item.totalCostCop) ? item.totalCostCop : 0;
    const grossProfitCop =
      typeof item.grossProfitCop === "number" && Number.isFinite(item.grossProfitCop)
        ? item.grossProfitCop
        : subtotalCop - totalCostCop;
    const grossMarginPct =
      typeof item.grossMarginPct === "number" && Number.isFinite(item.grossMarginPct)
        ? item.grossMarginPct
        : subtotalCop > 0
          ? Number(((grossProfitCop / subtotalCop) * 100).toFixed(1))
          : 0;
    if (!productId || quantity <= 0) return [];
    return [
      {
        productId,
        productName,
        presentation,
        quantity,
        unitPriceCop,
        subtotalCop,
        ...(recipeId ? { recipeId } : {}),
        unitCostCop,
        totalCostCop,
        grossProfitCop,
        grossMarginPct,
        matchedAddOns: Array.isArray(item.matchedAddOns)
          ? item.matchedAddOns.filter((v): v is string => typeof v === "string")
          : [],
        ingredients: [],
      },
    ];
  });

  if (items.length === 0) return undefined;

  const totalCostCop =
    typeof data.totalCostCop === "number" && Number.isFinite(data.totalCostCop) ? data.totalCostCop : 0;
  const revenueCop =
    typeof data.revenueCop === "number" && Number.isFinite(data.revenueCop) ? data.revenueCop : 0;
  const grossProfitCop =
    typeof data.grossProfitCop === "number" && Number.isFinite(data.grossProfitCop)
      ? data.grossProfitCop
      : revenueCop - totalCostCop;
  const grossMarginPct =
    typeof data.grossMarginPct === "number" && Number.isFinite(data.grossMarginPct)
      ? data.grossMarginPct
      : revenueCop > 0
        ? Number(((grossProfitCop / revenueCop) * 100).toFixed(1))
        : 0;
  const coveredItemsCount =
    typeof data.coveredItemsCount === "number" && Number.isFinite(data.coveredItemsCount)
      ? data.coveredItemsCount
      : items.filter((item) => Boolean(item.recipeId)).length;
  const totalItemsCount =
    typeof data.totalItemsCount === "number" && Number.isFinite(data.totalItemsCount)
      ? data.totalItemsCount
      : items.length;
  const coverage =
    data.coverage === "complete" || data.coverage === "partial" || data.coverage === "none"
      ? data.coverage
      : coveredItemsCount === totalItemsCount
        ? "complete"
        : coveredItemsCount > 0
          ? "partial"
          : "none";

  return {
    totalCostCop,
    revenueCop,
    grossProfitCop,
    grossMarginPct,
    coveredItemsCount,
    totalItemsCount,
    coverage,
    depletedAt: typeof data.depletedAt === "string" ? data.depletedAt : "",
    triggeredOnStatus: data.triggeredOnStatus === "entregado" ? "entregado" : "preparando",
    items,
  };
}

function toReportOrder(id: string, data: Record<string, unknown>): ReportOrder {
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const negocioId =
    typeof data.negocioId === "string" && data.negocioId.trim() ? data.negocioId.trim() : undefined;
  const escandallo = parseEscandalloSummary(data.escandallo);
  return {
    id,
    status: data.status as ReportOrder["status"],
    total: typeof data.total === "number" ? data.total : 0,
    customerId: typeof data.clienteUid === "string" ? data.clienteUid : "historico",
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
    ...(negocioId ? { negocioId } : {}),
    ...(escandallo ? { escandallo } : {}),
    rating: data.rating && typeof (data.rating as Record<string, unknown>).stars === "number"
      ? ((data.rating as Record<string, unknown>).stars as number)
      : undefined,
    items: rawItems.flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const item = raw as Record<string, unknown>;
      return [{ name: String(item.name ?? "Producto"), quantity: typeof item.quantity === "number" ? item.quantity : 0, subtotal: typeof item.subtotal === "number" ? item.subtotal : 0 }];
    }),
  };
}

export async function generateOrderReport(
  filter: OrderReportFilter,
  options?: {
    negocioId?: string;
    enforceTenantFilter?: boolean;
    includeCatalogProfitability?: boolean;
  }
): Promise<OrderReport> {
  const validatedFilter = orderReportFilterSchema.parse(filter);
  let query = getAdminDb().collection("pedidos").orderBy("createdAt", "asc");
  if (validatedFilter.from) query = query.where("createdAt", ">=", validatedFilter.from) as typeof query;
  if (validatedFilter.to) query = query.where("createdAt", "<=", validatedFilter.to) as typeof query;
  const snapshot = await query.get();
  const orders = snapshot.docs
    .map((document) => toReportOrder(document.id, document.data() as Record<string, unknown>))
    .filter((order) => {
      if (validatedFilter.status && order.status !== validatedFilter.status) return false;
      if (options?.enforceTenantFilter && options?.negocioId) {
        return (order.negocioId ?? DEFAULT_TENANT_ID) === options.negocioId;
      }
      return true;
    });
  const report = aggregateOrders(orders);

  if (options?.includeCatalogProfitability) {
    try {
      const { profitability: catalogProfitability } = await getCatalogProfitability(
        options.negocioId ?? DEFAULT_TENANT_ID
      );
      return { ...report, catalogProfitability };
    } catch {
      return report;
    }
  }

  return report;
}
