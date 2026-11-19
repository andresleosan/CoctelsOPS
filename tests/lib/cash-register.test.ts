import { describe, expect, it } from "vitest";

import {
  calculateCashReconciliation,
  calculateOrderPaymentChannels,
  sumCashExpenses,
} from "@/lib/cash-register/calculator";
import { cashRegisterActionSchema } from "@/lib/validation/cash-register";
import type { CashExpense } from "@/types/cash-register";
import type { Order } from "@/types/orders";

describe("cash-register calculator", () => {
  const openedAt = "2026-11-19T18:00:00.000Z";
  const closedAt = "2026-11-20T02:00:00.000Z";

  describe("calculateOrderPaymentChannels", () => {
    it("concilia ventas por canal incluyendo cobro mixto y excluye cancelados y fuera de rango", () => {
      const orders: Array<
        Pick<Order, "createdAt" | "status" | "total" | "paymentMethod" | "paymentBreakdown">
      > = [
        // Antes de apertura -> ignorado
        {
          createdAt: "2026-11-19T17:55:00.000Z",
          status: "entregado",
          total: 50000,
          paymentMethod: "efectivo",
        },
        // Efectivo puro
        {
          createdAt: "2026-11-19T18:30:00.000Z",
          status: "entregado",
          total: 36000,
          paymentMethod: "efectivo",
        },
        // Nequi
        {
          createdAt: "2026-11-19T19:15:00.000Z",
          status: "preparando",
          total: 42000,
          paymentMethod: "nequi",
        },
        // Daviplata
        {
          createdAt: "2026-11-19T20:00:00.000Z",
          status: "confirmado",
          total: 24000,
          paymentMethod: "daviplata",
        },
        // QR
        {
          createdAt: "2026-11-19T21:00:00.000Z",
          status: "entregado",
          total: 18000,
          paymentMethod: "qr",
        },
        // Transferencia
        {
          createdAt: "2026-11-19T21:30:00.000Z",
          status: "entregado",
          total: 30000,
          paymentMethod: "transferencia",
        },
        // Cobro mixto: 20.000 efectivo + 25.000 nequi
        {
          createdAt: "2026-11-19T22:10:00.000Z",
          status: "entregado",
          total: 45000,
          paymentMethod: "mixto",
          paymentBreakdown: {
            cashAmount: 20000,
            cashReceived: 20000,
            changeAmount: 0,
            digitalAmount: 25000,
            digitalMethod: "nequi",
          },
        },
        // Pedido web sin paymentMethod explícito
        {
          createdAt: "2026-11-19T23:00:00.000Z",
          status: "pendiente",
          total: 15000,
        },
        // Pedido cancelado dentro del turno -> solo incrementa cancelledCount
        {
          createdAt: "2026-11-19T23:30:00.000Z",
          status: "cancelado",
          total: 60000,
          paymentMethod: "efectivo",
        },
        // Después de cierre -> ignorado
        {
          createdAt: "2026-11-20T02:05:00.000Z",
          status: "entregado",
          total: 22000,
          paymentMethod: "efectivo",
        },
      ];

      const totals = calculateOrderPaymentChannels(orders, openedAt, closedAt);

      expect(totals.efectivo).toBe(56000); // 36000 + 20000
      expect(totals.nequi).toBe(67000); // 42000 + 25000
      expect(totals.daviplata).toBe(24000);
      expect(totals.qr).toBe(18000);
      expect(totals.transferencia).toBe(30000);
      expect(totals.sinEspecificar).toBe(15000);
      expect(totals.totalVentas).toBe(210000);
      expect(totals.ordersCount).toBe(7);
      expect(totals.cancelledCount).toBe(1);
    });
  });

  describe("calculateCashReconciliation", () => {
    const expenses: Array<Pick<CashExpense, "amount">> = [
      { amount: 12000 }, // Hielo
      { amount: 18000 }, // Limones
    ];

    it("suma correctamente las salidas de barra", () => {
      expect(sumCashExpenses(expenses)).toBe(30000);
    });

    it("calcula arqueo cuadrado cuando el efectivo contado coincide con el esperado", () => {
      const sales = calculateOrderPaymentChannels(
        [
          {
            createdAt: "2026-11-19T19:00:00.000Z",
            status: "entregado",
            total: 150000,
            paymentMethod: "efectivo",
          },
          {
            createdAt: "2026-11-19T20:00:00.000Z",
            status: "entregado",
            total: 80000,
            paymentMethod: "nequi",
          },
        ],
        openedAt,
        closedAt,
      );

      // expectedCash = 100.000 (base) + 150.000 (efectivo) - 30.000 (gastos) = 220.000
      const result = calculateCashReconciliation({
        openingBase: 100000,
        sales,
        expenses,
        count: { declaredCash: 220000 },
      });

      expect(result.expectedCash).toBe(220000);
      expect(result.declaredCash).toBe(220000);
      expect(result.cashDifference).toBe(0);
      expect(result.statusLabel).toBe("cuadrado");
      expect(result.digitalExpected).toBe(80000);
      expect(result.digitalDeclared).toBe(80000);
      expect(result.digitalDifference).toBe(0);
    });

    it("detecta sobrante cuando hay más efectivo físico del esperado", () => {
      const sales = calculateOrderPaymentChannels(
        [
          {
            createdAt: "2026-11-19T19:00:00.000Z",
            status: "entregado",
            total: 100000,
            paymentMethod: "efectivo",
          },
        ],
        openedAt,
        closedAt,
      );

      // expectedCash = 50.000 + 100.000 - 30.000 = 120.000
      const result = calculateCashReconciliation({
        openingBase: 50000,
        sales,
        expenses,
        count: { declaredCash: 125000 },
      });

      expect(result.expectedCash).toBe(120000);
      expect(result.cashDifference).toBe(5000);
      expect(result.statusLabel).toBe("sobrante");
    });

    it("detecta faltante cuando hay menos efectivo físico del esperado y diferencia digital", () => {
      const sales = calculateOrderPaymentChannels(
        [
          {
            createdAt: "2026-11-19T19:00:00.000Z",
            status: "entregado",
            total: 100000,
            paymentMethod: "efectivo",
          },
          {
            createdAt: "2026-11-19T20:00:00.000Z",
            status: "entregado",
            total: 50000,
            paymentMethod: "nequi",
          },
        ],
        openedAt,
        closedAt,
      );

      // expectedCash = 50.000 + 100.000 - 30.000 = 120.000
      const result = calculateCashReconciliation({
        openingBase: 50000,
        sales,
        expenses,
        count: {
          declaredCash: 112000,
          declaredNequi: 45000,
        },
      });

      expect(result.expectedCash).toBe(120000);
      expect(result.cashDifference).toBe(-8000);
      expect(result.statusLabel).toBe("faltante");
      expect(result.digitalExpected).toBe(50000);
      expect(result.digitalDeclared).toBe(45000);
      expect(result.digitalDifference).toBe(-5000);
    });
  });

  describe("cashRegisterActionSchema", () => {
    it("valida payloads de apertura, gasto y cierre", () => {
      expect(
        cashRegisterActionSchema.parse({
          action: "open",
          openingBase: 100000,
        }),
      ).toMatchObject({ action: "open", openingBase: 100000 });

      expect(
        cashRegisterActionSchema.parse({
          action: "expense",
          shiftId: "shift-1",
          category: "hielo",
          concept: "Hielo barra",
          amount: 12000,
        }),
      ).toMatchObject({ action: "expense", amount: 12000 });

      expect(
        cashRegisterActionSchema.parse({
          action: "close",
          shiftId: "shift-1",
          countBreakdown: { declaredCash: 250000 },
        }),
      ).toMatchObject({ action: "close", shiftId: "shift-1" });
    });

    it("rechaza gastos con monto 0 o negativo y base negativa", () => {
      expect(() =>
        cashRegisterActionSchema.parse({
          action: "open",
          openingBase: -5000,
        }),
      ).toThrow();

      expect(() =>
        cashRegisterActionSchema.parse({
          action: "expense",
          shiftId: "shift-1",
          category: "hielo",
          concept: "Hielo",
          amount: 0,
        }),
      ).toThrow();
    });
  });
});
