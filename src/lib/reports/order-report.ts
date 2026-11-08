import "server-only";

import { z } from "zod";

import { getAdminDb } from "@/lib/firebase-admin";
import type { OrderReport, OrderReportFilter, ReportOrder } from "@/types/operations";

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
  let cancellationCount = 0;
  let totalRevenue = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  for (const order of orders) {
    totalRevenue += order.total;
    if (order.rating && order.rating >= 1 && order.rating <= 5) {
      ratingSum += order.rating;
      ratingCount += 1;
    }
    revenueByStatus[order.status] = (revenueByStatus[order.status] ?? 0) + order.total;
    if (order.status === "cancelado") cancellationCount += 1;
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
  return {
    orderCount: orders.length,
    totalRevenue,
    revenueByStatus,
    topProducts,
    topCustomers,
    cancellationCount,
    ...(csat !== undefined ? { csat, ratingCount } : {}),
  };
}

function toReportOrder(id: string, data: Record<string, unknown>): ReportOrder {
  const rawItems = Array.isArray(data.items) ? data.items : [];
  return {
    id,
    status: data.status as ReportOrder["status"],
    total: typeof data.total === "number" ? data.total : 0,
    customerId: typeof data.clienteUid === "string" ? data.clienteUid : "historico",
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
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

export async function generateOrderReport(filter: OrderReportFilter): Promise<OrderReport> {
  const validatedFilter = orderReportFilterSchema.parse(filter);
  let query = getAdminDb().collection("pedidos").orderBy("createdAt", "asc");
  if (validatedFilter.from) query = query.where("createdAt", ">=", validatedFilter.from) as typeof query;
  if (validatedFilter.to) query = query.where("createdAt", "<=", validatedFilter.to) as typeof query;
  const snapshot = await query.get();
  const orders = snapshot.docs.map((document) => toReportOrder(document.id, document.data() as Record<string, unknown>)).filter((order) => {
    return !validatedFilter.status || order.status === validatedFilter.status;
  });
  return aggregateOrders(orders);
}
