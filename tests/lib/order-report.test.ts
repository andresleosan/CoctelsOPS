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

  it("agrega rentabilidad real por cóctel desde escandallo excluyendo cancelados e ítems sin receta", () => {
    const escandalloOrders: ReportOrder[] = [
      {
        id: "ord-1",
        status: "entregado",
        total: 30_000,
        customerId: "c1",
        createdAt: "2026-08-01T10:00:00.000Z",
        items: [
          { name: "Mojito Clásico", quantity: 1, subtotal: 12_000 },
          { name: "Botella Agua", quantity: 1, subtotal: 18_000 },
        ],
        escandallo: {
          totalCostCop: 8_400,
          revenueCop: 30_000,
          grossProfitCop: 21_600,
          grossMarginPct: 72,
          coveredItemsCount: 1,
          totalItemsCount: 2,
          coverage: "partial",
          depletedAt: "2026-08-01T10:05:00.000Z",
          triggeredOnStatus: "entregado",
          items: [
            {
              productId: "prod-mojito",
              productName: "Mojito Clásico",
              presentation: "14 oz",
              quantity: 1,
              unitPriceCop: 12_000,
              subtotalCop: 12_000,
              recipeId: "rec-mojito",
              unitCostCop: 8_400,
              totalCostCop: 8_400,
              grossProfitCop: 3_600,
              grossMarginPct: 30,
              matchedAddOns: [],
              ingredients: [],
            },
            {
              productId: "prod-agua",
              productName: "Botella Agua",
              presentation: "Personal",
              quantity: 1,
              unitPriceCop: 18_000,
              subtotalCop: 18_000,
              // sin recipeId -> debe excluirse para no inflar margen
              unitCostCop: 0,
              totalCostCop: 0,
              grossProfitCop: 18_000,
              grossMarginPct: 100,
              matchedAddOns: [],
              ingredients: [],
            },
          ],
        },
      },
      {
        id: "ord-cancel",
        status: "cancelado",
        total: 12_000,
        customerId: "c2",
        createdAt: "2026-08-01T11:00:00.000Z",
        items: [{ name: "Mojito Clásico", quantity: 1, subtotal: 12_000 }],
        escandallo: {
          totalCostCop: 8_400,
          revenueCop: 12_000,
          grossProfitCop: 3_600,
          grossMarginPct: 30,
          coveredItemsCount: 1,
          totalItemsCount: 1,
          coverage: "complete",
          depletedAt: "2026-08-01T11:01:00.000Z",
          triggeredOnStatus: "preparando",
          items: [
            {
              productId: "prod-mojito",
              productName: "Mojito Clásico",
              presentation: "14 oz",
              quantity: 1,
              unitPriceCop: 12_000,
              subtotalCop: 12_000,
              recipeId: "rec-mojito",
              unitCostCop: 8_400,
              totalCostCop: 8_400,
              grossProfitCop: 3_600,
              grossMarginPct: 30,
              matchedAddOns: [],
              ingredients: [],
            },
          ],
        },
      },
    ];

    const report = aggregateOrders(escandalloOrders);
    expect(report.profitability).toBeDefined();
    expect(report.profitability?.coveredOrderCount).toBe(1);
    expect(report.profitability?.totalEligibleOrderCount).toBe(1);
    expect(report.profitability?.revenueCop).toBe(12_000);
    expect(report.profitability?.totalCostCop).toBe(8_400);
    expect(report.profitability?.grossProfitCop).toBe(3_600);
    expect(report.profitability?.grossMarginPct).toBe(30);
    expect(report.profitability?.cocktails).toHaveLength(1);
    expect(report.profitability?.lowMarginAlerts).toHaveLength(1);
    expect(report.profitability?.lowMarginAlerts[0]?.health).toBe("critico");
  });
});
