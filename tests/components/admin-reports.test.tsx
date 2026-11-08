import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OrderReport } from "@/types/operations";

const mockUser = { getIdToken: vi.fn().mockResolvedValue("fake-token") };

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    isAdmin: true,
  }),
}));

vi.mock("@/components/admin/AdminGuard", () => ({
  AdminGuard: ({ children }: { children: React.ReactNode }) => <div data-testid="admin-guard">{children}</div>,
}));

import ReportsPage from "@/app/admin/reportes/page";

const mockReport: OrderReport = {
  orderCount: 8,
  totalRevenue: 200_000,
  cancellationCount: 1,
  revenueByStatus: {
    entregado: 180_000,
    cancelado: 20_000,
  },
  topProducts: [
    { name: "Fresa Salvaje", quantity: 6, revenue: 120_000 },
    { name: "Maracuyá Sour", quantity: 4, revenue: 80_000 },
  ],
  topCustomers: [
    { customerBucket: "Cliente 1", orders: 3, revenue: 90_000 },
    { customerBucket: "Cliente 2", orders: 2, revenue: 60_000 },
  ],
};

describe("ReportsPage (Panel de Reportes y Cierre de Caja)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/admin/reports/orders")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ report: mockReport }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renderiza las 5 métricas principales incluyendo el Ticket Promedio en COP", async () => {
    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByText("Cierre de Caja & Reportes")).toBeInTheDocument();
    });

    // 1. Ingresos Totales
    expect(screen.getByText("$200.000")).toBeInTheDocument();
    // 2. Total Pedidos
    expect(screen.getByText("8")).toBeInTheDocument();
    // 3. Ticket Promedio (200.000 / 8 = 25.000)
    expect(screen.getByText("Ticket Promedio")).toBeInTheDocument();
    expect(screen.getByText("$25.000")).toBeInTheDocument();
    // 4. Cancelaciones
    expect(screen.getByText("Cancelaciones")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    // 5. Clientes Únicos
    expect(screen.getByText("Clientes")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("permite cambiar entre filtros rápidos de turno (Hoy, Últimos 7 días, Este Mes, Histórico)", async () => {
    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByText("$200.000")).toBeInTheDocument();
    });

    const last7DaysBtn = screen.getByRole("button", { name: "Últimos 7 días" });
    fireEvent.click(last7DaysBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/admin/reports/orders?from="),
        expect.anything()
      );
    });

    const thisMonthBtn = screen.getByRole("button", { name: "Este Mes" });
    fireEvent.click(thisMonthBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    const historicBtn = screen.getByRole("button", { name: "Histórico" });
    fireEvent.click(historicBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/admin/reports/orders?",
        expect.anything()
      );
    });
  });

  it("renderiza botones de exportación CSV y WhatsApp para cierre de caja", async () => {
    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByText("Cierre Operativo y Exportación")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Descargar CSV/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Compartir WhatsApp/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copiar Resumen/i })).toBeInTheDocument();
  });

  it("permite copiar el resumen de cierre de caja al portapapeles", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Copiar Resumen/i })).toBeInTheDocument();
    });

    const copyBtn = screen.getByRole("button", { name: /Copiar Resumen/i });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(
        expect.stringContaining("CIERRE DE CAJA — COCTELS OPS")
      );
      expect(screen.getByText("¡Copiado!")).toBeInTheDocument();
    });
  });

  it("abre ventana de WhatsApp al hacer clic en Compartir WhatsApp", async () => {
    const openMock = vi.fn();
    vi.stubGlobal("open", openMock);

    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Compartir WhatsApp/i })).toBeInTheDocument();
    });

    const shareBtn = screen.getByRole("button", { name: /Compartir WhatsApp/i });
    fireEvent.click(shareBtn);

    expect(openMock).toHaveBeenCalledWith(
      expect.stringContaining("https://api.whatsapp.com/send?text="),
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("muestra el ranking de productos más vendidos e ingresos por estado", async () => {
    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByText("Fresa Salvaje")).toBeInTheDocument();
      expect(screen.getByText("Maracuyá Sour")).toBeInTheDocument();
    });

    expect(screen.getByText("$120.000")).toBeInTheDocument();
    expect(screen.getByText("$80.000")).toBeInTheDocument();
    expect(screen.getByText("entregado")).toBeInTheDocument();
    expect(screen.getByText("$180.000")).toBeInTheDocument();
  });

  it("muestra un mensaje informativo cuando no hay datos en el período", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ report: null }),
      })
    );

    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No hay datos para el período seleccionado/i)).toBeInTheDocument();
    });
  });

  it("muestra alerta de error cuando la API falla", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: "Permiso denegado" }),
      })
    );

    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Permiso denegado");
    });
  });
});
