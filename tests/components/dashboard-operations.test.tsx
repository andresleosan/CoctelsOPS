import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useAuthMock, fetchAdminSessionMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  fetchAdminSessionMock: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: useAuthMock,
}));

vi.mock("@/components/admin/AdminGuard", () => ({
  AdminGuard: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-guard">{children}</div>
  ),
}));

vi.mock("@/components/admin/AdminAccessCard", () => ({
  AdminAccessCard: () => <div data-testid="admin-access-card" />,
}));

vi.mock("@/components/admin/admin-session-cache", () => ({
  fetchAdminSession: fetchAdminSessionMock,
  invalidateAdminSessionCache: vi.fn(),
}));

import AdminDashboard from "@/app/admin/dashboard/page";
import { DashboardOperationsCards } from "@/components/admin/DashboardOperationsCards";
import type { BarTab } from "@/types/tabs";

describe("DashboardOperationsCards y KPIs en /admin/dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("muestra KPIs en vivo de caja abierta, efectivo esperado, comprobantes y mesas activas", () => {
    const sampleTabs: BarTab[] = [
      {
        id: "tab-1",
        negocioId: "coctels-ops",
        tableNumber: "Mesa 4",
        guestCount: 3,
        status: "abierta",
        rounds: [
          {
            roundNumber: 1,
            orderId: "ord-1",
            items: [],
            subtotal: 45000,
            createdAt: "2026-11-24T14:00:00.000Z",
            createdByUid: "staff-1",
          },
        ],
        subtotal: 45000,
        total: 45000,
        billRequest: {
          requestedAt: "2026-11-24T14:30:00.000Z",
          splitMode: "equal",
          guestCount: 3,
          perPersonAmount: 15000,
        },
        openedAt: "2026-11-24T14:00:00.000Z",
        openedByUid: "staff-1",
        openedByName: "Mesero",
        updatedAt: "2026-11-24T14:30:00.000Z",
      },
      {
        id: "tab-2",
        negocioId: "coctels-ops",
        tableNumber: "Barra 1",
        guestCount: 2,
        status: "abierta",
        rounds: [
          {
            roundNumber: 1,
            orderId: "ord-2",
            items: [],
            subtotal: 30000,
            createdAt: "2026-11-24T14:10:00.000Z",
            createdByUid: "staff-1",
          },
        ],
        subtotal: 30000,
        total: 30000,
        openedAt: "2026-11-24T14:10:00.000Z",
        openedByUid: "staff-1",
        openedByName: "Mesero",
        updatedAt: "2026-11-24T14:10:00.000Z",
      },
    ];

    render(
      <DashboardOperationsCards
        loading={false}
        cash={{
          activeShift: {
            id: "shift-1",
            negocioId: "coctels-ops",
            status: "abierta",
            openedAt: "2026-11-24T12:00:00.000Z",
            openedByUid: "cajero-1",
            openedByName: "Camila Barra",
            openingBase: 100000,
            expenses: [
              {
                id: "exp-1",
                concept: "Hielo",
                category: "hielo",
                amount: 15000,
                createdAt: "2026-11-24T13:00:00.000Z",
                createdByUid: "cajero-1",
              },
            ],
            updatedAt: "2026-11-24T13:00:00.000Z",
          },
          liveSales: {
            efectivo: 80000,
            nequi: 40000,
            daviplata: 0,
            qr: 0,
            transferencia: 0,
            sinEspecificar: 0,
            totalVentas: 120000,
            ordersCount: 5,
            cancelledCount: 0,
          },
          transferOrders: [
            {
              orderId: "ord-tr-1",
              customerName: "Juan",
              phone: "3001234567",
              total: 40000,
              status: "pendiente",
              createdAt: "2026-11-24T14:15:00.000Z",
              paymentVerificationStatus: "pendiente_verificacion",
            },
          ],
        }}
        tabs={sampleTabs}
      />,
    );

    const cashCard = screen.getByTestId("dashboard-cash-kpi");
    expect(cashCard).toHaveTextContent("Turno abierto");
    expect(cashCard).toHaveTextContent("Camila Barra");
    expect(cashCard).toHaveTextContent("$120.000");
    // Efectivo esperado = 100.000 + 80.000 - 15.000 = 165.000
    expect(cashCard).toHaveTextContent("$165.000");

    const cashLink = screen.getByRole("link", { name: /Ir a Caja/i });
    expect(cashLink).toHaveAttribute("href", "/admin/caja");
    expect(cashLink.className).toContain("min-h-[44px]");

    const tabsCard = screen.getByTestId("dashboard-tabs-kpi");
    expect(tabsCard).toHaveTextContent("2 abiertas");
    expect(tabsCard).toHaveTextContent("$75.000");
    expect(tabsCard).toHaveTextContent("Mesa 4");
    expect(tabsCard).toHaveTextContent("Cuenta");

    const tabsLink = screen.getByRole("link", { name: /Ir a Mesas/i });
    expect(tabsLink).toHaveAttribute("href", "/admin/mesas");
    expect(tabsLink.className).toContain("min-h-[44px]");
  });

  it("muestra estado de turno cerrado cuando no hay turno activo", () => {
    render(
      <DashboardOperationsCards
        loading={false}
        cash={{ activeShift: null, liveSales: null, transferOrders: [] }}
        tabs={[]}
      />,
    );

    expect(screen.getByText("Turno cerrado")).toBeInTheDocument();
    expect(screen.getByText("Sin mesas abiertas")).toBeInTheDocument();
  });

  it("carga accesos rápidos y KPIs de Caja y Mesas en /admin/dashboard para usuarios con pedidos.read", async () => {
    useAuthMock.mockReturnValue({
      user: { uid: "staff-1", getIdToken: vi.fn().mockResolvedValue("token-staff") },
      isAdmin: false,
    });
    fetchAdminSessionMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        user: { permissions: ["pedidos.read"] },
        adminAccess: { isAdmin: false },
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/admin/stats")) {
          return new Response(
            JSON.stringify({ stats: { orders: 2, pending: 1, revenue: 30000 } }),
            { status: 200 },
          );
        }
        if (url.includes("/api/pedidos")) {
          return new Response(JSON.stringify({ orders: [] }), { status: 200 });
        }
        if (url.includes("/api/admin/caja")) {
          return new Response(
            JSON.stringify({
              activeShift: null,
              liveSales: null,
              history: [],
              transferOrders: [],
            }),
            { status: 200 },
          );
        }
        if (url.includes("/api/admin/mesas")) {
          return new Response(JSON.stringify({ tabs: [] }), { status: 200 });
        }
        return new Response("{}", { status: 404 });
      }),
    );

    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-cash-kpi")).toBeInTheDocument();
      expect(screen.getByTestId("dashboard-tabs-kpi")).toBeInTheDocument();
    });

    expect(screen.getByRole("link", { name: /Caja y Turnos/i })).toHaveAttribute(
      "href",
      "/admin/caja",
    );
    expect(screen.getByRole("link", { name: /Mesas y Cuentas/i })).toHaveAttribute(
      "href",
      "/admin/mesas",
    );
  });

  it("oculta KPIs y accesos de Caja y Mesas cuando el usuario solo tiene productos.read", async () => {
    useAuthMock.mockReturnValue({
      user: { uid: "staff-prod", getIdToken: vi.fn().mockResolvedValue("token-prod") },
      isAdmin: false,
    });
    fetchAdminSessionMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        user: { permissions: ["productos.read"] },
        adminAccess: { isAdmin: false },
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/admin/stats?scope=products")) {
          return new Response(JSON.stringify({ stats: { activeProducts: 10 } }), {
            status: 200,
          });
        }
        return new Response("{}", { status: 404 });
      }),
    );

    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Productos (Menú)")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("dashboard-cash-kpi")).toBeNull();
    expect(screen.queryByTestId("dashboard-tabs-kpi")).toBeNull();
    expect(screen.queryByRole("link", { name: /Caja y Turnos/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Mesas y Cuentas/i })).toBeNull();
  });
});
