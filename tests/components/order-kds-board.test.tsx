import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUser = { getIdToken: vi.fn().mockResolvedValue("fake-token") };

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    isAdmin: true,
  }),
}));

vi.mock("@/components/admin/AdminGuard", () => ({
  AdminGuard: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-guard">{children}</div>
  ),
}));

vi.mock("@/components/admin/PermissionGate", () => ({
  PermissionGate: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="permission-gate">{children}</div>
  ),
}));

import AdminOrdersPage from "@/app/admin/pedidos/page";
import { OrderKdsBoard } from "@/components/admin/OrderKdsBoard";
import {
  calculateOrderElapsedMinutes,
  detectNewPendingOrderIds,
  getOrderSlaStatus,
  groupOrdersIntoKdsColumns,
} from "@/lib/orders/kds-sla";
import type { Order } from "@/types/orders";

const BASE_TIME = Date.parse("2026-11-07T20:00:00.000Z");

const sampleOrders: Order[] = [
  {
    id: "ord-pending-old",
    clienteUid: "u-1",
    customerName: "Camila Restrepo",
    phone: "300 111 2233",
    address: "Mesa 4 - Consumo en local",
    notes: "Sin pitillo, alergia a fresa",
    items: [
      {
        productId: "granizado-maracuya",
        name: "Granizado Tropical",
        quantity: 2,
        unitPrice: 15000,
        subtotal: 30000,
        customization: {
          size: "16 oz",
          flavors: ["Maracuyá", "Mango Biche"],
          addOns: ["Gomitas", "Chamoy"],
        },
      },
    ],
    subtotal: 30000,
    total: 30000,
    status: "pendiente",
    createdAt: "2026-11-07T19:35:00.000Z", // 25 min ago -> critical
    updatedAt: "2026-11-07T19:35:00.000Z",
    audit: { createdByUid: "u-1", createdAt: "2026-11-07T19:35:00.000Z" },
  },
  {
    id: "ord-prep-warn",
    clienteUid: "u-2",
    customerName: "Mateo Gómez",
    phone: "310 555 8899",
    address: "Cra 43A # 10-20",
    items: [
      {
        productId: "mojito-lulo",
        name: "Mojito de Lulo",
        quantity: 1,
        unitPrice: 22000,
        subtotal: 22000,
        customization: {
          size: "14 oz",
          flavors: ["Lulo", "Hierbabuena"],
          addOns: [],
        },
      },
    ],
    subtotal: 22000,
    total: 22000,
    status: "preparando",
    createdAt: "2026-11-07T19:45:00.000Z", // 15 min ago -> warning
    updatedAt: "2026-11-07T19:47:00.000Z",
    audit: { createdByUid: "u-2", createdAt: "2026-11-07T19:45:00.000Z" },
  },
  {
    id: "ord-done",
    clienteUid: "u-3",
    customerName: "Valentina Ríos",
    phone: "320 999 0000",
    address: "Barra principal",
    items: [
      {
        productId: "soda-frutos",
        name: "Soda Italiana",
        quantity: 1,
        unitPrice: 12000,
        subtotal: 12000,
        customization: {
          size: "16 oz",
          flavors: ["Frutos Rojos"],
          addOns: ["Cereza"],
        },
      },
    ],
    subtotal: 12000,
    total: 12000,
    status: "entregado",
    createdAt: "2026-11-07T19:55:00.000Z",
    updatedAt: "2026-11-07T19:59:00.000Z",
    audit: { createdByUid: "u-3", createdAt: "2026-11-07T19:55:00.000Z" },
  },
];

describe("kds-sla domain helpers", () => {
  it("calculates elapsed minutes and SLA levels accurately", () => {
    expect(calculateOrderElapsedMinutes("2026-11-07T19:54:00.000Z", BASE_TIME)).toBe(6);

    const okSla = getOrderSlaStatus("2026-11-07T19:54:00.000Z", "pendiente", BASE_TIME);
    expect(okSla.level).toBe("ok");
    expect(okSla.label).toBe("6 min · A tiempo");

    const warnSla = getOrderSlaStatus("2026-11-07T19:45:00.000Z", "preparando", BASE_TIME);
    expect(warnSla.level).toBe("warning");
    expect(warnSla.label).toBe("15 min · Atención");

    const criticalSla = getOrderSlaStatus("2026-11-07T19:35:00.000Z", "pendiente", BASE_TIME);
    expect(criticalSla.level).toBe("critical");
    expect(criticalSla.label).toBe("25 min · Demorado");

    const completedSla = getOrderSlaStatus("2026-11-07T19:35:00.000Z", "entregado", BASE_TIME);
    expect(completedSla.level).toBe("completed");
    expect(completedSla.label).toBe("25 min");
  });

  it("groups orders into 4 operational columns with FIFO order for active stations", () => {
    const newerPending: Order = {
      ...sampleOrders[0],
      id: "ord-pending-newer",
      createdAt: "2026-11-07T19:58:00.000Z",
    };

    const columns = groupOrdersIntoKdsColumns([newerPending, ...sampleOrders]);
    const nuevosCol = columns.find((col) => col.key === "nuevos")!;
    const prepCol = columns.find((col) => col.key === "preparacion")!;
    const doneCol = columns.find((col) => col.key === "finalizados")!;

    expect(nuevosCol.orders.map((o) => o.id)).toEqual(["ord-pending-old", "ord-pending-newer"]);
    expect(prepCol.orders.map((o) => o.id)).toEqual(["ord-prep-warn"]);
    expect(doneCol.orders.map((o) => o.id)).toEqual(["ord-done"]);
  });

  it("detects only newly arrived pending orders for sound alerts", () => {
    const previousIds = new Set(["ord-pending-old", "ord-prep-warn"]);
    const newlyArrived: Order = {
      ...sampleOrders[0],
      id: "ord-pending-fresh",
      status: "pendiente",
    };
    const detected = detectNewPendingOrderIds(previousIds, [...sampleOrders, newlyArrived]);
    expect(detected).toEqual(["ord-pending-fresh"]);
  });
});

describe("OrderKdsBoard & AdminOrdersPage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, options?: { method?: string; body?: string }) => {
        if (url === "/api/pedidos" && (!options?.method || options.method === "GET")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ orders: sampleOrders }),
          });
        }
        if (url.includes("/api/pedidos/") && options?.method === "PATCH") {
          const parsed = JSON.parse(options.body ?? "{}") as { status: Order["status"] };
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                order: { ...sampleOrders[0], status: parsed.status },
              }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders full recipe details (size, flavors, toppings, notes) and SLA badges in KDS board", () => {
    const onAdvanceOrder = vi.fn();
    render(
      <OrderKdsBoard
        orders={sampleOrders}
        nowMs={BASE_TIME}
        onAdvanceOrder={onAdvanceOrder}
      />,
    );

    expect(screen.getByTestId("kds-column-nuevos")).toBeInTheDocument();
    expect(screen.getByTestId("kds-column-preparacion")).toBeInTheDocument();
    expect(screen.getByText("2x Granizado Tropical")).toBeInTheDocument();
    expect(screen.getByText("Maracuyá, Mango Biche")).toBeInTheDocument();
    expect(screen.getByText(/Gomitas, Chamoy/)).toBeInTheDocument();
    expect(screen.getByText(/Sin pitillo, alergia a fresa/)).toBeInTheDocument();
    expect(screen.getByTestId("kds-sla-ord-pending-old")).toHaveTextContent("25 min · Demorado");

    const confirmBtn = screen.getByRole("button", { name: "CONFIRMAR" });
    fireEvent.click(confirmBtn);
    expect(onAdvanceOrder).toHaveBeenCalledWith(sampleOrders[0], true);
  });

  it("allows toggling between Vista Lista and Tablero KDS and advancing an order in 1-tap from KDS", async () => {
    render(<AdminOrdersPage />);

    await waitFor(() => {
      expect(screen.getByText("Camila Restrepo")).toBeInTheDocument();
    });

    expect(screen.getByText("2 activos en barra")).toBeInTheDocument();

    const kdsToggleBtn = screen.getByRole("button", { name: /Tablero KDS/i });
    fireEvent.click(kdsToggleBtn);

    expect(screen.getByTestId("order-kds-board")).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "CONFIRMAR" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/pedidos/ord-pending-old",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "confirmado" }),
        }),
      );
    });
  });
});
