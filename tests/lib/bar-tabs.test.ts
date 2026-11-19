import { describe, expect, it } from "vitest";

import {
  calculateBarTabTotals,
  calculateEqualSplitShares,
  normalizeTableNumber,
  validateBarTabPayments,
} from "@/lib/tabs/calculator";
import { barTabActionSchema } from "@/lib/validation/tabs";

describe("bar-tabs calculator and validation", () => {
  it("normaliza el nombre o número de mesa", () => {
    expect(normalizeTableNumber("  Mesa   4  ")).toBe("Mesa 4");
    expect(normalizeTableNumber("Barra   VIP")).toBe("Barra VIP");
  });

  it("acumula múltiples rondas de consumo correctamente", () => {
    const summary = calculateBarTabTotals([
      {
        subtotal: 36000,
        items: [
          {
            productId: "p1",
            name: "Margarita",
            quantity: 2,
            unitPrice: 18000,
            subtotal: 36000,
            customization: { size: "16 oz", flavors: ["Limón"], addOns: [] },
          },
        ],
      },
      {
        subtotal: 44000,
        items: [
          {
            productId: "p2",
            name: "Mojito",
            quantity: 2,
            unitPrice: 22000,
            subtotal: 44000,
            customization: { size: "24 oz", flavors: ["Hierbabuena"], addOns: ["Gomitas"] },
          },
        ],
      },
    ]);

    expect(summary.roundsCount).toBe(2);
    expect(summary.itemsCount).toBe(4);
    expect(summary.subtotal).toBe(80000);
    expect(summary.total).toBe(80000);
  });

  it("divide cuentas equitativamente repartiendo el residuo en COP exactos", () => {
    const shares = calculateEqualSplitShares(100_000, 3);
    expect(shares).toEqual([33334, 33333, 33333]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100_000);

    const evenShares = calculateEqualSplitShares(80_000, 4);
    expect(evenShares).toEqual([20_000, 20_000, 20_000, 20_000]);
  });

  it("valida pagos mixtos, cambio y faltantes al cerrar la cuenta", () => {
    const covered = validateBarTabPayments(80_000, [
      { amount: 50_000 },
      { amount: 30_000 },
    ]);
    expect(covered.isCovered).toBe(true);
    expect(covered.shortfall).toBe(0);
    expect(covered.changeAmount).toBe(0);

    const overpaid = validateBarTabPayments(80_000, [{ amount: 100_000 }]);
    expect(overpaid.isCovered).toBe(true);
    expect(overpaid.changeAmount).toBe(20_000);

    const shortfall = validateBarTabPayments(80_000, [{ amount: 50_000 }]);
    expect(shortfall.isCovered).toBe(false);
    expect(shortfall.shortfall).toBe(30_000);
  });

  it("valida esquemas Zod para abrir, agregar ronda, cerrar y cancelar", () => {
    expect(
      barTabActionSchema.safeParse({
        action: "open",
        tableNumber: "Mesa 5",
        guestCount: 4,
      }).success,
    ).toBe(true);

    expect(
      barTabActionSchema.safeParse({
        action: "open",
        tableNumber: "   ",
      }).success,
    ).toBe(false);

    expect(
      barTabActionSchema.safeParse({
        action: "add_round",
        tabId: "tab-1",
        items: [
          {
            productId: "prod-1",
            quantity: 2,
            customization: { size: "16 oz", flavors: ["Maracuyá"], addOns: [] },
          },
        ],
      }).success,
    ).toBe(true);

    expect(
      barTabActionSchema.safeParse({
        action: "close",
        tabId: "tab-1",
        splitMode: "equal",
        guestCount: 2,
        payments: [
          { label: "Comensal 1", method: "efectivo", amount: 25_000 },
          { label: "Comensal 2", method: "nequi", amount: 25_000 },
        ],
      }).success,
    ).toBe(true);

    expect(
      barTabActionSchema.safeParse({
        action: "close",
        tabId: "tab-1",
        splitMode: "single",
        payments: [{ method: "efectivo", amount: 0 }],
      }).success,
    ).toBe(false);
  });
});
