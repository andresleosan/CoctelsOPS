import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { usePathname } = vi.hoisted(() => ({
  usePathname: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname,
}));

vi.mock("next/image", () => ({
  default: ({ src, alt, ...props }: Record<string, unknown>) => {
    const cleanProps = { ...props };
    delete cleanProps.priority;
    delete cleanProps.fill;
    delete cleanProps.unoptimized;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src as string} alt={alt as string} {...cleanProps} />;
  },
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/admin/PermissionGate", () => ({
  PermissionGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/auth/AuthStatus", () => ({
  AuthStatus: () => <div data-testid="auth-status-mock" />,
}));

vi.mock("@/context/cart-context", () => ({
  useCart: () => ({
    items: [],
    totalItems: 0,
    totalPrice: 0,
    addItem: vi.fn(),
    updateQuantity: vi.fn(),
  }),
  generateCartItemId: (id: string) => id,
  CartProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { TableMapBoard } from "@/components/admin/TableMapBoard";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import OpsyChat from "@/components/opsy/OpsyChat";
import { BarDisplayBoard } from "@/components/orders/BarDisplayBoard";
import type { BarDisplaySnapshot } from "@/types/display";
import type { BarTab } from "@/types/tabs";

const sampleSnapshot: BarDisplaySnapshot = {
  negocioId: "coctels-ops",
  storeName: "Coctels OPS",
  emergencyPauseActive: true,
  emergencyPauseReason: "Alta demanda en barra",
  preparing: [
    {
      orderId: "ord-1001",
      turnCode: "#1001",
      displayName: "Laura M.",
      serviceType: "pickup",
      itemsCount: 2,
      stage: "preparing",
      status: "preparando",
      createdAt: "2026-11-26T21:00:00.000Z",
      updatedAt: "2026-11-26T21:01:00.000Z",
    },
  ],
  ready: [
    {
      orderId: "ord-2002",
      turnCode: "#2002",
      displayName: "Carlos P.",
      serviceType: "mesa",
      tableNumber: "Mesa 4",
      itemsCount: 1,
      stage: "ready",
      status: "en_camino",
      createdAt: "2026-11-26T20:50:00.000Z",
      updatedAt: "2026-11-26T21:05:00.000Z",
    },
    {
      orderId: "ord-3003",
      turnCode: "#3003",
      displayName: "Ana V.",
      serviceType: "delivery",
      itemsCount: 3,
      stage: "ready",
      status: "en_camino",
      createdAt: "2026-11-26T20:52:00.000Z",
      updatedAt: "2026-11-26T21:06:00.000Z",
    },
  ],
  updatedAt: "2026-11-26T21:07:00.000Z",
};

const sampleTabs: BarTab[] = [
  {
    id: "tab-m1",
    negocioId: "coctels-ops",
    tableNumber: "Mesa 1",
    customerName: "Sofía",
    guestCount: 3,
    status: "abierta",
    rounds: [
      {
        roundNumber: 1,
        orderId: "ord-r1",
        items: [
          {
            productId: "p1",
            name: "Mojito Neón",
            quantity: 2,
            unitPrice: 18000,
            subtotal: 36000,
            customization: { size: "16 oz", flavors: ["Hierbabuena"], addOns: [] },
          },
        ],
        subtotal: 36000,
        createdAt: "2026-11-26T20:40:00.000Z",
        createdByUid: "staff-1",
      },
    ],
    subtotal: 36000,
    total: 36000,
    openedAt: "2026-11-26T20:35:00.000Z",
    openedByUid: "staff-1",
    openedByName: "Staff",
    updatedAt: "2026-11-26T20:40:00.000Z",
  },
  {
    id: "tab-b1",
    negocioId: "coctels-ops",
    tableNumber: "Barra 1",
    guestCount: 2,
    status: "abierta",
    rounds: [
      {
        roundNumber: 1,
        orderId: "ord-r2",
        items: [
          {
            productId: "p2",
            name: "Granizado Lulo",
            quantity: 2,
            unitPrice: 15000,
            subtotal: 30000,
            customization: { size: "16 oz", flavors: ["Lulo"], addOns: [] },
          },
        ],
        subtotal: 30000,
        createdAt: "2026-11-26T20:45:00.000Z",
        createdByUid: "staff-1",
      },
    ],
    subtotal: 30000,
    total: 30000,
    billRequest: {
      requestedAt: "2026-11-26T20:55:00.000Z",
      splitMode: "equal",
      guestCount: 2,
      perPersonAmount: 15000,
      preferredMethod: "nequi",
    },
    openedAt: "2026-11-26T20:40:00.000Z",
    openedByUid: "staff-1",
    openedByName: "Staff",
    updatedAt: "2026-11-26T20:55:00.000Z",
  },
];

describe("BarDisplayBoard, TableMapBoard y ocultación de chrome en /pantalla", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    usePathname.mockReturnValue("/pantalla");
  });

  afterEach(() => {
    cleanup();
  });

  it("oculta Header, Footer y OpsyChat cuando pathname es /pantalla", () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    render(
      <>
        <Header />
        <Footer />
        <OpsyChat />
      </>,
    );

    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByRole("contentinfo")).toBeNull();
    expect(screen.queryByRole("button", { name: /abrir asistente opsy bot/i })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renderiza columnas de BarDisplayBoard, pausa de barra, filtro local y refresco manual", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => sampleSnapshot,
    } as Response);

    render(<BarDisplayBoard initialSnapshot={sampleSnapshot} pollIntervalMs={60_000} />);

    expect(screen.getByText("En preparación")).toBeInTheDocument();
    expect(screen.getByText("Listo para recoger")).toBeInTheDocument();
    expect(screen.getByTestId("bar-display-pause-badge")).toHaveTextContent("Barra en pausa");

    expect(screen.getByText("#1001")).toBeInTheDocument();
    expect(screen.getByText("#2002")).toBeInTheDocument();
    expect(screen.getByText("#3003")).toBeInTheDocument();

    // Filtrar solo Barra y Mesas excluye domicilio (#3003)
    fireEvent.click(screen.getByRole("button", { name: "Barra y Mesas" }));
    expect(screen.getByText("#2002")).toBeInTheDocument();
    expect(screen.queryByText("#3003")).toBeNull();

    // Refresco manual
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/pantalla", { cache: "no-store" }));
  });

  it("muestra estados vacíos limpios cuando no hay pedidos en preparación ni listos", () => {
    render(
      <BarDisplayBoard
        initialSnapshot={{
          ...sampleSnapshot,
          emergencyPauseActive: false,
          preparing: [],
          ready: [],
        }}
        pollIntervalMs={60_000}
      />,
    );

    expect(screen.getByText("Barra al día")).toBeInTheDocument();
    expect(screen.getByText("Esperando entregas listas")).toBeInTheDocument();
    expect(screen.queryByTestId("bar-display-pause-badge")).toBeNull();
  });

  it("renderiza TableMapBoard con estados Libre/Ocupada/Pidiendo cuenta, filtros y callbacks en 1 tap", () => {
    const onOpenTable = vi.fn();
    const onSelectTab = vi.fn();
    const onAddRound = vi.fn();
    const onCloseTab = vi.fn();
    const onCancelEmptyTab = vi.fn();

    render(
      <TableMapBoard
        tabs={sampleTabs}
        selectedTabId="tab-m1"
        onOpenTable={onOpenTable}
        onSelectTab={onSelectTab}
        onAddRound={onAddRound}
        onCloseTab={onCloseTab}
        onCancelEmptyTab={onCancelEmptyTab}
      />,
    );

    // Detalle de mesa seleccionada visible
    expect(screen.getByTestId("table-map-selected-detail")).toHaveTextContent("Mesa 1");
    expect(screen.getByTestId("table-map-selected-detail")).toHaveTextContent("Mojito Neón");

    // Abrir mesa libre (Mesa 2)
    fireEvent.click(screen.getByRole("button", { name: /Abrir Mesa 2/i }));
    expect(onOpenTable).toHaveBeenCalledWith("Mesa 2");

    // Filtrar por "Pidiendo cuenta (1)"
    fireEvent.click(screen.getByRole("button", { name: /Pidiendo cuenta \(1\)/i }));
    expect(screen.getByTestId("table-map-slot-barra 1")).toBeInTheDocument();
    expect(screen.queryByTestId("table-map-slot-mesa 2")).toBeNull();

    // Cobrar mesa pidiendo cuenta en 1 tap
    fireEvent.click(screen.getByRole("button", { name: /Cobrar/i }));
    expect(onCloseTab).toHaveBeenCalledWith(expect.objectContaining({ id: "tab-b1" }));
  });
});
