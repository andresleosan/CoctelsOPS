import { describe, expect, it } from "vitest";

import {
  buildBarDisplayColumns,
  detectNewlyReadyOrderIds,
  filterBarDisplayTickets,
  formatPublicDisplayName,
  formatTurnCode,
  toBarDisplayTicket,
} from "@/lib/orders/bar-display";
import {
  buildTableMapSlots,
  filterTableMapSlots,
  resolveTableMapState,
  summarizeTableMap,
} from "@/lib/tabs/table-map";
import type { Order } from "@/types/orders";
import type { BarTab } from "@/types/tabs";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "ord-abc1234",
    clienteUid: "uid-secret-1",
    customerName: "Camila Restrepo",
    phone: "3001234567",
    address: "Calle 10 # 20-30",
    serviceType: "pickup",
    items: [
      {
        productId: "p1",
        name: "Granizado Maracuyá",
        quantity: 2,
        unitPrice: 15000,
        subtotal: 30000,
        customization: { size: "16 oz", flavors: ["Maracuyá"], addOns: [] },
      },
    ],
    subtotal: 30000,
    total: 30000,
    status: "preparando",
    createdAt: "2026-11-26T20:00:00.000Z",
    updatedAt: "2026-11-26T20:05:00.000Z",
    audit: { createdByUid: "uid-secret-1", createdAt: "2026-11-26T20:00:00.000Z" },
    ...overrides,
  };
}

function makeTab(overrides: Partial<BarTab> = {}): BarTab {
  return {
    id: "tab-1",
    negocioId: "coctels-ops",
    tableNumber: "Mesa 4",
    customerName: "Grupo Laura",
    guestCount: 4,
    status: "abierta",
    rounds: [
      {
        roundNumber: 1,
        orderId: "ord-round-1",
        items: [
          {
            productId: "p1",
            name: "Granizado Fresa",
            quantity: 2,
            unitPrice: 15000,
            subtotal: 30000,
            customization: { size: "16 oz", flavors: ["Fresa"], addOns: [] },
          },
        ],
        subtotal: 30000,
        createdAt: "2026-11-26T20:10:00.000Z",
        createdByUid: "staff-1",
      },
    ],
    subtotal: 30000,
    total: 30000,
    openedAt: "2026-11-26T20:00:00.000Z",
    openedByUid: "staff-1",
    openedByName: "Bartender",
    updatedAt: "2026-11-26T20:10:00.000Z",
    ...overrides,
  };
}

describe("bar-display pure logic", () => {
  it("formatea códigos de turno alfanuméricos sin exponer IDs largos", () => {
    expect(formatTurnCode("ord-abc1234")).toBe("#1234");
    expect(formatTurnCode("ab-9f_x")).toBe("#B9FX");
    expect(formatTurnCode("---")).toBe("#0000");
  });

  it("formatea nombres públicos omitiendo apellidos completos y PII", () => {
    expect(formatPublicDisplayName("  Camila   Restrepo  ")).toBe("Camila R.");
    expect(formatPublicDisplayName("Mateo")).toBe("Mateo");
    expect(formatPublicDisplayName("   ")).toBe("Cliente");
    expect(formatPublicDisplayName("SuperNombreMuyLargoDePrueba Perez")).toBe(
      "SuperNombreMuyLa P.",
    );
  });

  it("proyecta tickets únicamente para estados visibles en barra", () => {
    expect(toBarDisplayTicket(makeOrder({ status: "pendiente" }))).toBeNull();
    expect(toBarDisplayTicket(makeOrder({ status: "entregado" }))).toBeNull();
    expect(toBarDisplayTicket(makeOrder({ status: "cancelado" }))).toBeNull();

    const prep = toBarDisplayTicket(
      makeOrder({ id: "ord-99a1", status: "confirmado", serviceType: "mesa", tableNumber: "Mesa 3" }),
    );
    expect(prep).toMatchObject({
      orderId: "ord-99a1",
      turnCode: "#99A1",
      displayName: "Camila R.",
      serviceType: "mesa",
      tableNumber: "Mesa 3",
      itemsCount: 2,
      stage: "preparing",
      status: "confirmado",
    });

    const ready = toBarDisplayTicket(makeOrder({ id: "ord-77b2", status: "en_camino" }));
    expect(ready?.stage).toBe("ready");
    expect(ready?.turnCode).toBe("#77B2");
  });

  it("ordena preparing FIFO, ready más reciente primero y excluye órdenes mayores a 24h", () => {
    const nowMs = Date.parse("2026-11-26T22:00:00.000Z");
    const orders: Order[] = [
      makeOrder({
        id: "ord-prep-2",
        status: "preparando",
        createdAt: "2026-11-26T21:40:00.000Z",
        updatedAt: "2026-11-26T21:41:00.000Z",
      }),
      makeOrder({
        id: "ord-prep-1",
        status: "confirmado",
        createdAt: "2026-11-26T21:30:00.000Z",
        updatedAt: "2026-11-26T21:31:00.000Z",
      }),
      makeOrder({
        id: "ord-ready-old",
        status: "en_camino",
        createdAt: "2026-11-26T21:10:00.000Z",
        updatedAt: "2026-11-26T21:20:00.000Z",
      }),
      makeOrder({
        id: "ord-ready-new",
        status: "en_camino",
        createdAt: "2026-11-26T21:15:00.000Z",
        updatedAt: "2026-11-26T21:55:00.000Z",
      }),
      makeOrder({
        id: "ord-stale",
        status: "preparando",
        createdAt: "2026-11-25T10:00:00.000Z",
        updatedAt: "2026-11-25T10:05:00.000Z",
      }),
    ];

    const columns = buildBarDisplayColumns(orders, { nowMs });
    expect(columns.preparing.map((t) => t.orderId)).toEqual(["ord-prep-1", "ord-prep-2"]);
    expect(columns.ready.map((t) => t.orderId)).toEqual(["ord-ready-new", "ord-ready-old"]);
  });

  it("detecta nuevos tickets listos y filtra por canal local vs todos", () => {
    const columns = buildBarDisplayColumns(
      [
        makeOrder({ id: "ord-local", status: "en_camino", serviceType: "mesa" }),
        makeOrder({ id: "ord-deliv", status: "en_camino", serviceType: "delivery" }),
      ],
      { nowMs: Date.parse("2026-11-26T22:00:00.000Z") },
    );

    const added = detectNewlyReadyOrderIds(new Set(["ord-local"]), columns.ready);
    expect(added).toEqual(["ord-deliv"]);

    expect(filterBarDisplayTickets(columns.ready, "all")).toHaveLength(2);
    expect(filterBarDisplayTickets(columns.ready, "local").map((t) => t.orderId)).toEqual([
      "ord-local",
    ]);
  });
});

describe("table-map pure logic", () => {
  it("resuelve estados libre, ocupada y pidiendo_cuenta", () => {
    expect(resolveTableMapState(null)).toBe("libre");
    expect(resolveTableMapState(makeTab({ status: "cerrada" }))).toBe("libre");
    expect(resolveTableMapState(makeTab({ status: "abierta" }))).toBe("ocupada");
    expect(
      resolveTableMapState(
        makeTab({
          status: "abierta",
          billRequest: {
            requestedAt: "2026-11-26T20:30:00.000Z",
            splitMode: "equal",
            guestCount: 2,
          },
        }),
      ),
    ).toBe("pidiendo_cuenta");
  });

  it("empareja variantes de nombre de mesa ('4' -> 'Mesa 4') y agrega mesas personalizadas en 'otras'", () => {
    const tabs: BarTab[] = [
      makeTab({ id: "tab-m4", tableNumber: "4", total: 45000 }),
      makeTab({
        id: "tab-b1",
        tableNumber: "Barra 1",
        total: 25000,
        billRequest: {
          requestedAt: "2026-11-26T20:40:00.000Z",
          splitMode: "single",
          guestCount: 1,
        },
      }),
      makeTab({ id: "tab-custom", tableNumber: "Terraza 9", total: 60000 }),
      makeTab({ id: "tab-closed", tableNumber: "Mesa 2", status: "cerrada", total: 90000 }),
    ];

    const slots = buildTableMapSlots(tabs);
    const mesa4 = slots.find((s) => s.key === "mesa 4");
    const mesa2 = slots.find((s) => s.key === "mesa 2");
    const barra1 = slots.find((s) => s.key === "barra 1");
    const terraza9 = slots.find((s) => s.tableNumber === "Terraza 9");

    expect(mesa4?.state).toBe("ocupada");
    expect(mesa4?.tab?.id).toBe("tab-m4");
    expect(mesa2?.state).toBe("libre");
    expect(barra1?.state).toBe("pidiendo_cuenta");
    expect(terraza9?.zone).toBe("otras");
    expect(terraza9?.isCustom).toBe(true);

    const summary = summarizeTableMap(slots);
    expect(summary).toEqual({
      total: 14,
      free: 11,
      occupied: 2,
      requestingBill: 1,
      openAmountCop: 130000,
    });

    expect(filterTableMapSlots(slots, "pidiendo_cuenta")).toHaveLength(1);
    expect(filterTableMapSlots(slots, "ocupada")).toHaveLength(2);
    expect(filterTableMapSlots(slots, "libre")).toHaveLength(11);
  });
});
