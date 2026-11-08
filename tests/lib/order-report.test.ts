import { describe, expect, it } from "vitest";

import { aggregateOrders, orderReportFilterSchema } from "@/lib/reports/order-report";
import type { ReportOrder } from "@/types/operations";

const orders: ReportOrder[] = [
  { id: "1", status: "entregado", total: 20_000, customerId: "a", createdAt: "2026-08-01T10:00:00.000Z", items: [{ name: "Fresa", quantity: 2, subtotal: 20_000 }] },
  { id: "2", status: "cancelado", total: 30_000, customerId: "b", createdAt: "2026-08-02T10:00:00.000Z", items: [{ name: "Mango", quantity: 1, subtotal: 30_000 }] },
  { id: "3", status: "entregado", total: 15_000, customerId: "a", createdAt: "2026-08-03T10:00:00.000Z", items: [{ name: "Fresa", quantity: 1, subtotal: 15_000 }] },
];

describe("reporte agregado de pedidos", () => {
  it("devuelve conteos, ingresos por estado, top productos, clientes y cancelaciones", () => {
    expect(aggregateOrders(orders)).toEqual({
      orderCount: 3,
      totalRevenue: 65_000,
      revenueByStatus: { entregado: 35_000, cancelado: 30_000 },
      topProducts: [{ name: "Fresa", quantity: 3, revenue: 35_000 }, { name: "Mango", quantity: 1, revenue: 30_000 }],
      topCustomers: [{ customerBucket: "Cliente 1", orders: 2, revenue: 35_000 }, { customerBucket: "Cliente 2", orders: 1, revenue: 30_000 }],
      cancellationCount: 1,
    });
  });

  it("rechaza un rango donde la fecha inicial supera la final", () => {
    expect(() => orderReportFilterSchema.parse({ from: "2026-08-10T00:00:00.000Z", to: "2026-08-01T00:00:00.000Z" })).toThrow("La fecha inicial");
  });

  it("calcula el CSAT promedio y total de calificaciones cuando los pedidos están calificados", () => {
    const ratedOrders: ReportOrder[] = [
      { id: "1", status: "entregado", total: 20_000, customerId: "a", createdAt: "2026-08-01T10:00:00.000Z", items: [], rating: 5 },
      { id: "2", status: "entregado", total: 25_000, customerId: "b", createdAt: "2026-08-02T10:00:00.000Z", items: [], rating: 4 },
      { id: "3", status: "cancelado", total: 10_000, customerId: "c", createdAt: "2026-08-03T10:00:00.000Z", items: [] },
    ];

    const result = aggregateOrders(ratedOrders);
    expect(result.csat).toBe(4.5);
    expect(result.ratingCount).toBe(2);
  });
});
