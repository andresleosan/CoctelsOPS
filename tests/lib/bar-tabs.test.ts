import { describe, expect, it } from "vitest";

import {
  calculateBarTabTotals,
  calculateEqualSplitShares,
  canonicalizeTableNumber,
  getTableLookupKey,
  isPickupTableIdentifier,
  normalizeTableNumber,
  toPublicTableTab,
  validateBarTabPayments,
} from "@/lib/tabs/calculator";
import {
  barTabActionSchema,
  publicTableActionSchema,
  publicTableIdSchema,
} from "@/lib/validation/tabs";
import type { BarTab } from "@/types/tabs";

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

  it("canoniza identificadores de mesa y distingue retiro en barra", () => {
    expect(canonicalizeTableNumber("4")).toBe("Mesa 4");
    expect(canonicalizeTableNumber("  mesa   4  ")).toBe("Mesa 4");
    expect(canonicalizeTableNumber("Barra 1")).toBe("Barra 1");
    expect(canonicalizeTableNumber("VIP 2")).toBe("VIP 2");

    expect(getTableLookupKey("4")).toBe("mesa 4");
    expect(getTableLookupKey("Mesa   4")).toBe("mesa 4");

    expect(isPickupTableIdentifier("Barra")).toBe(true);
    expect(isPickupTableIdentifier("recoger en barra")).toBe(true);
    expect(isPickupTableIdentifier("Barra 1")).toBe(false);
    expect(isPickupTableIdentifier("Mesa 4")).toBe(false);
  });

  it("proyecta PublicTableTab omitiendo campos internos de staff y pagos", () => {
    const tab: BarTab = {
      id: "tab-pub-1",
      negocioId: "coctels-ops",
      tableNumber: "Mesa 4",
      customerName: "Mesa de Juan",
      guestCount: 3,
      status: "abierta",
      rounds: [
        {
          roundNumber: 1,
          orderId: "ord-1",
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
          subtotal: 36000,
          createdAt: "2026-11-22T20:00:00.000Z",
          createdByUid: "staff-uid-secreto",
          createdByName: "Cajero Interno",
          source: "cliente_qr",
          idempotencyKey: "secret-idem-key",
        },
      ],
      subtotal: 36000,
      total: 36000,
      billRequest: {
        requestedAt: "2026-11-22T20:30:00.000Z",
        splitMode: "equal",
        guestCount: 3,
        perPersonAmount: 12000,
        preferredMethod: "nequi",
      },
      openedAt: "2026-11-22T19:55:00.000Z",
      openedByUid: "staff-uid-secreto",
      openedByName: "Admin Secreto",
      closedByUid: "staff-close-uid",
      closedByName: "Cajero Close",
      closingNotes: "Nota interna",
      payments: [
        {
          id: "pay-1",
          label: "Pago 1",
          method: "efectivo",
          amount: 36000,
          paidAt: "2026-11-22T20:40:00.000Z",
        },
      ],
      updatedAt: "2026-11-22T20:30:00.000Z",
    };

    const statuses = new Map([["ord-1", "preparando" as const]]);
    const publicTab = toPublicTableTab(tab, statuses);

    expect(publicTab.id).toBe("tab-pub-1");
    expect(publicTab.itemsCount).toBe(2);
    expect(publicTab.rounds[0]?.orderStatus).toBe("preparando");
    expect(publicTab.rounds[0]?.source).toBe("cliente_qr");
    expect(publicTab.billRequest?.perPersonAmount).toBe(12000);

    const serialized = JSON.stringify(publicTab);
    expect(serialized).not.toContain("staff-uid-secreto");
    expect(serialized).not.toContain("Admin Secreto");
    expect(serialized).not.toContain("Cajero Interno");
    expect(serialized).not.toContain("secret-idem-key");
    expect(serialized).not.toContain("closingNotes");
    expect(serialized).not.toContain("payments");
  });

  it("valida esquemas públicos Zod de mesa, rondas QR y solicitud de cuenta", () => {
    expect(publicTableIdSchema.safeParse("Mesa 4").success).toBe(true);
    expect(publicTableIdSchema.safeParse("VIP-2").success).toBe(true);
    expect(publicTableIdSchema.safeParse("../admin").success).toBe(false);
    expect(publicTableIdSchema.safeParse("   ").success).toBe(false);

    expect(
      publicTableActionSchema.safeParse({
        action: "add_round",
        items: [
          {
            productId: "prod-1",
            quantity: 2,
            customization: { size: "16 oz", flavors: ["Maracuyá"], addOns: [] },
          },
        ],
        customerName: "Camila",
      }).success,
    ).toBe(true);

    expect(
      publicTableActionSchema.safeParse({
        action: "add_round",
        items: [],
      }).success,
    ).toBe(false);

    expect(
      publicTableActionSchema.safeParse({
        action: "request_bill",
        splitMode: "equal",
        guestCount: 4,
        preferredMethod: "nequi",
      }).success,
    ).toBe(true);
  });
});
