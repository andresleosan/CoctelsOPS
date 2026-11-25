import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useCart, useAuth, useRouter } = vi.hoisted(() => ({
  useCart: vi.fn(),
  useAuth: vi.fn(),
  useRouter: vi.fn(),
}));

vi.mock("@/context/cart-context", () => ({ useCart }));
vi.mock("@/hooks/use-auth", () => ({ useAuth }));
vi.mock("next/navigation", () => ({ useRouter }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/admin/AdminGuard", () => ({
  AdminGuard: ({ children }: { children: ReactNode }) => (
    <div data-testid="admin-guard">{children}</div>
  ),
}));
vi.mock("@/components/admin/PermissionGate", () => ({
  PermissionGate: ({ children }: { children: ReactNode }) => (
    <div data-testid="permission-gate">{children}</div>
  ),
}));

import CheckoutPage from "@/app/checkout/page";
import DriverQueuePage from "@/app/repartidor/page";
import { DeliveryZonesEditor } from "@/components/admin/DeliveryZonesEditor";
import { OrderKdsBoard } from "@/components/admin/OrderKdsBoard";
import {
  calculateDeliveryQuote,
  filterDeliveryQueueOrders,
  isDeliveryOrder,
  resolveDeliveryZones,
  summarizeDriverQueue,
} from "@/lib/orders/delivery-zones";
import type { DeliveryZoneConfig, StoreConfiguration } from "@/types/operations";
import type { Order } from "@/types/orders";

const dynamicConfig: StoreConfiguration = {
  whatsappNumber: "573245550000",
  businessHours: [],
  deliveryZones: ["Laureles", "El Poblado"],
  deliveryZoneRates: [
    {
      id: "laureles",
      name: "Laureles",
      feeCop: 4000,
      estimatedMinutes: 30,
      freeDeliveryMinCop: 50000,
      active: true,
    },
    {
      id: "el-poblado",
      name: "El Poblado",
      feeCop: 7000,
      estimatedMinutes: 45,
      freeDeliveryMinCop: 70000,
      active: true,
    },
    {
      id: "envigado",
      name: "Envigado",
      feeCop: 9000,
      estimatedMinutes: 55,
      active: false,
    },
  ],
  estimatedDeliveryMinutes: 40,
  messages: {
    orderReceived: "Recibido",
    orderStatus: "Estado",
    unavailable: "No disponible",
  },
};

const sampleQueueOrders: Order[] = [
  {
    id: "ord-del-1",
    clienteUid: "cli-1",
    customerName: "Laura Gómez",
    phone: "3001112233",
    address: "Circular 4 # 70-10",
    serviceType: "delivery",
    deliveryZoneId: "laureles",
    deliveryZoneName: "Laureles",
    deliveryFee: 4000,
    items: [
      {
        productId: "fresa",
        name: "Granizado Fresa",
        quantity: 2,
        unitPrice: 15000,
        subtotal: 30000,
        customization: { size: "16 oz", flavors: ["Fresa"], addOns: [] },
      },
    ],
    subtotal: 30000,
    total: 34000,
    status: "preparando",
    createdAt: "2026-11-24T19:00:00.000Z",
    updatedAt: "2026-11-24T19:05:00.000Z",
    audit: { createdByUid: "cli-1", createdAt: "2026-11-24T19:00:00.000Z" },
  },
  {
    id: "ord-del-2",
    clienteUid: "cli-2",
    customerName: "Mateo Ruiz",
    phone: "3102223344",
    address: "Cra 43A # 10-20",
    serviceType: "delivery",
    deliveryZoneId: "el-poblado",
    deliveryZoneName: "El Poblado",
    deliveryFee: 7000,
    assignedDriver: {
      uid: "driver-1",
      name: "Camilo Moto",
      assignedAt: "2026-11-24T19:12:00.000Z",
      assignedByUid: "admin-1",
    },
    items: [
      {
        productId: "maracuya",
        name: "Granizado Maracuyá",
        quantity: 1,
        unitPrice: 15000,
        subtotal: 15000,
        customization: { size: "16 oz", flavors: ["Maracuyá"], addOns: [] },
      },
    ],
    subtotal: 15000,
    total: 22000,
    status: "en_camino",
    createdAt: "2026-11-24T19:10:00.000Z",
    updatedAt: "2026-11-24T19:12:00.000Z",
    audit: { createdByUid: "cli-2", createdAt: "2026-11-24T19:10:00.000Z" },
  },
  {
    id: "ord-mesa-1",
    clienteUid: "cli-3",
    customerName: "Mesa 4",
    phone: "3203334455",
    address: "Mesa 4 - Consumo en local",
    serviceType: "mesa",
    tableNumber: "4",
    items: [],
    subtotal: 20000,
    total: 20000,
    status: "preparando",
    createdAt: "2026-11-24T19:15:00.000Z",
    updatedAt: "2026-11-24T19:15:00.000Z",
    audit: { createdByUid: "cli-3", createdAt: "2026-11-24T19:15:00.000Z" },
  },
];

describe("delivery-zones domain helpers", () => {
  it("normalizes legacy deliveryZones string[] as $0 active zones", () => {
    const zones = resolveDeliveryZones({
      deliveryZones: ["Centro", "Boston"],
      estimatedDeliveryMinutes: 35,
    });
    expect(zones).toEqual([
      { id: "centro", name: "Centro", feeCop: 0, estimatedMinutes: 35, active: true },
      { id: "boston", name: "Boston", feeCop: 0, estimatedMinutes: 35, active: true },
    ]);
  });

  it("calculates dynamic fee, ETA, free delivery threshold, and zero fee for mesa/pickup", () => {
    const activeZones = resolveDeliveryZones(dynamicConfig);
    expect(activeZones.map((z) => z.id)).toEqual(["laureles", "el-poblado"]);

    const paidQuote = calculateDeliveryQuote({
      serviceType: "delivery",
      zone: activeZones[0],
      subtotalCop: 30000,
    });
    expect(paidQuote.feeCop).toBe(4000);
    expect(paidQuote.estimatedMinutes).toBe(30);
    expect(paidQuote.isFreeByThreshold).toBe(false);
    expect(paidQuote.freeDeliveryRemainingCop).toBe(20000);

    const freeQuote = calculateDeliveryQuote({
      serviceType: "delivery",
      zone: activeZones[0],
      subtotalCop: 50000,
    });
    expect(freeQuote.feeCop).toBe(0);
    expect(freeQuote.isFreeByThreshold).toBe(true);
    expect(freeQuote.freeDeliveryRemainingCop).toBe(0);

    const mesaQuote = calculateDeliveryQuote({
      serviceType: "mesa",
      zone: activeZones[0],
      subtotalCop: 30000,
    });
    expect(mesaQuote.feeCop).toBe(0);
  });

  it("filters only delivery orders and computes driver queue summary accurately", () => {
    expect(isDeliveryOrder(sampleQueueOrders[0])).toBe(true);
    expect(isDeliveryOrder(sampleQueueOrders[2])).toBe(false);

    const unassigned = filterDeliveryQueueOrders(sampleQueueOrders, {
      statusFilter: "activos",
      assigneeFilter: "sin_asignar",
    });
    expect(unassigned.map((o) => o.id)).toEqual(["ord-del-1"]);

    const summary = summarizeDriverQueue(sampleQueueOrders);
    expect(summary).toEqual({
      totalActive: 2,
      readyForPickup: 1,
      inTransit: 1,
      deliveredCount: 0,
      unassignedCount: 1,
      pendingCollectionCop: 56000,
    });
  });
});

describe("DeliveryZonesEditor component", () => {
  afterEach(() => {
    cleanup();
  });

  it("adds, edits, toggles, and removes delivery zones", () => {
    const initialZones: DeliveryZoneConfig[] = [
      { id: "laureles", name: "Laureles", feeCop: 4000, estimatedMinutes: 30, active: true },
    ];
    const onChange = vi.fn();

    render(
      <DeliveryZonesEditor
        zones={initialZones}
        defaultEstimatedMinutes={45}
        onChange={onChange}
      />,
    );

    expect(screen.getByTestId("btn-remove-zone-0")).toBeDisabled();

    fireEvent.click(screen.getByTestId("btn-add-delivery-zone"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const addedList = onChange.mock.calls[0][0] as DeliveryZoneConfig[];
    expect(addedList).toHaveLength(2);
    expect(addedList[1].name).toBe("Zona 2");

    fireEvent.click(screen.getByTestId("btn-toggle-zone-0"));
    const toggledList = onChange.mock.calls[1][0] as DeliveryZoneConfig[];
    expect(toggledList[0].active).toBe(false);
  });
});

describe("CheckoutPage dynamic delivery zones", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    useRouter.mockReturnValue({ replace: vi.fn(), push: vi.fn() });
    useAuth.mockReturnValue({
      user: { getIdToken: vi.fn().mockResolvedValue("token-checkout") },
      loading: false,
      isVerified: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("requires selecting a dynamic zone, updates delivery fee/ETA/total, and sends zone IDs without client fee", async () => {
    useCart.mockReturnValue({
      totalPrice: 30000,
      items: [
        {
          id: "item-1",
          productId: "fresa",
          name: "Granizado Fresa",
          price: 15000,
          quantity: 2,
          customization: { size: "16 oz", flavors: ["Fresa"], addOns: [] },
        },
      ],
      clearCart: vi.fn(),
      getCheckoutItems: vi.fn(() => [
        {
          productId: "fresa",
          quantity: 2,
          customization: { size: "16 oz", flavors: ["Fresa"], addOns: [] },
        },
      ]),
    });

    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/configuration")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ configuration: dynamicConfig }),
        } as Response;
      }
      if (url.includes("/api/pedidos")) {
        return {
          ok: true,
          status: 201,
          json: async () => ({ order: { id: "ord-zone-1" } }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<CheckoutPage />);

    expect(await screen.findByTestId("checkout-delivery-zones")).toBeInTheDocument();
    expect(screen.queryByTestId("checkout-zone-envigado")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Nombre Completo/i), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText(/Teléfono de Contacto/i), {
      target: { value: "3001112233" },
    });
    fireEvent.change(screen.getByLabelText(/Dirección Exacta/i), {
      target: { value: "Cra 70 # 44-10" },
    });

    fireEvent.click(screen.getByRole("button", { name: /CONFIRMAR PEDIDO/i }));
    expect(
      await screen.findByText(/Selecciona tu zona o barrio de entrega/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("checkout-zone-el-poblado"));

    await waitFor(() => {
      expect(screen.getByTestId("checkout-summary-delivery-fee")).toHaveTextContent(
        "Domicilio (El Poblado)",
      );
      expect(screen.getByText("Entrega estimada: 45 min")).toBeInTheDocument();
      expect(screen.getByText(`$${(37000).toLocaleString()}`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /CONFIRMAR PEDIDO/i }));

    await waitFor(() => {
      const orderCall = fetchSpy.mock.calls.find(([url]) => String(url).includes("/api/pedidos"));
      expect(orderCall).toBeDefined();
      const body = JSON.parse(String(orderCall?.[1]?.body ?? "{}"));
      expect(body.deliveryZoneId).toBe("el-poblado");
      expect(body.deliveryZoneName).toBe("El Poblado");
      expect(body).not.toHaveProperty("deliveryFee");
    });
  });

  it("shows free delivery badge when subtotal meets zone threshold", async () => {
    useCart.mockReturnValue({
      totalPrice: 55000,
      items: [
        {
          id: "item-1",
          productId: "fresa",
          name: "Granizado Fresa",
          price: 27500,
          quantity: 2,
          customization: { size: "24 oz", flavors: ["Fresa"], addOns: [] },
        },
      ],
      clearCart: vi.fn(),
      getCheckoutItems: vi.fn(() => []),
    });

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ configuration: dynamicConfig }),
    } as Response);

    render(<CheckoutPage />);

    const laurelesBtn = await screen.findByTestId("checkout-zone-laureles");
    fireEvent.click(laurelesBtn);

    expect(await screen.findByTestId("checkout-free-delivery-badge")).toHaveTextContent(
      "¡Domicilio gratis aplicado en Laureles!",
    );
    expect(screen.getByTestId("checkout-summary-delivery-fee")).toHaveTextContent("GRATIS");
  });
});

describe("OrderKdsBoard driver assignment & DriverQueuePage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("allows assigning a driver from KDS board", async () => {
    const onAssignDriver = vi.fn();
    render(
      <OrderKdsBoard
        orders={[sampleQueueOrders[0]]}
        availableDrivers={[{ uid: "drv-9", name: "Andrés Moto", phone: "3009998877" }]}
        onAdvanceOrder={vi.fn()}
        onAssignDriver={onAssignDriver}
      />,
    );

    expect(screen.getByTestId("kds-driver-badge-ord-del-1")).toHaveTextContent("Sin repartidor");
    fireEvent.click(screen.getByTestId("btn-open-assign-driver-ord-del-1"));

    const select = screen.getByLabelText("Seleccionar repartidor del equipo");
    fireEvent.change(select, { target: { value: "drv-9" } });

    fireEvent.click(screen.getByTestId("btn-save-assign-driver-ord-del-1"));

    await waitFor(() => {
      expect(onAssignDriver).toHaveBeenCalledWith(sampleQueueOrders[0], {
        uid: "drv-9",
        name: "Andrés Moto",
        phone: "3009998877",
      });
    });
  });

  it("renders /repartidor queue, filters delivery orders, and claims an order in 1 tap", async () => {
    useAuth.mockReturnValue({
      user: {
        uid: "driver-1",
        displayName: "Camilo Moto",
        getIdToken: vi.fn().mockResolvedValue("driver-token"),
      },
      loading: false,
      isAdmin: true,
    });

    const fetchMock = vi.fn().mockImplementation(async (url: string, options?: { method?: string }) => {
      if (url === "/api/pedidos" && (!options?.method || options.method === "GET")) {
        return {
          ok: true,
          json: async () => ({ orders: sampleQueueOrders }),
        } as Response;
      }
      if (url === "/api/pedidos/ord-del-1/repartidor" && options?.method === "PATCH") {
        return {
          ok: true,
          json: async () => ({
            order: {
              ...sampleQueueOrders[0],
              assignedDriver: {
                uid: "driver-1",
                name: "Camilo Moto",
                assignedAt: "2026-11-24T19:20:00.000Z",
                assignedByUid: "driver-1",
              },
            },
          }),
        } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<DriverQueuePage />);

    await waitFor(() => {
      expect(screen.getByTestId("driver-queue-board")).toBeInTheDocument();
    });

    expect(screen.getByTestId("driver-queue-card-ord-del-1")).toBeInTheDocument();
    expect(screen.getByTestId("driver-queue-card-ord-del-2")).toBeInTheDocument();
    expect(screen.queryByTestId("driver-queue-card-ord-mesa-1")).not.toBeInTheDocument();

    expect(screen.getByTestId("kpi-ready-pickup")).toHaveTextContent("1");
    expect(screen.getByTestId("kpi-in-transit")).toHaveTextContent("1");

    fireEvent.click(screen.getByTestId("filter-assignee-sin_asignar"));
    expect(screen.getByTestId("driver-queue-card-ord-del-1")).toBeInTheDocument();
    expect(screen.queryByTestId("driver-queue-card-ord-del-2")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("btn-claim-order-ord-del-1"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/pedidos/ord-del-1/repartidor",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            driver: { uid: "driver-1", name: "Camilo Moto" },
          }),
        }),
      );
    });
  });
});
