import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SuppliesManager } from "@/components/admin/SuppliesManager";
import type { SuppliesKpis, SupplyItem } from "@/types/supplies";

const mockUser = { getIdToken: vi.fn().mockResolvedValue("test-token") };

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    isAdmin: true,
  }),
}));

const mockSupplies: SupplyItem[] = [
  {
    id: "sup-1",
    negocioId: "coctels-ops",
    name: "Ron Medellín 3 Años 750ml",
    category: "licor",
    unit: "botella",
    currentStock: 0,
    minStock: 2,
    costPerUnit: 35000,
    supplier: "FLA",
    status: "critico",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "sup-2",
    negocioId: "coctels-ops",
    name: "Pulpa Maracuyá 1kg",
    category: "pulpa",
    unit: "kg",
    currentStock: 1.5,
    minStock: 3,
    costPerUnit: 12000,
    supplier: "Pulpas del Campo",
    status: "bajo",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "sup-3",
    negocioId: "coctels-ops",
    name: "Vasos 16 oz",
    category: "desechable",
    unit: "unidad",
    currentStock: 150,
    minStock: 30,
    costPerUnit: 350,
    supplier: "Desechables Antioquia",
    status: "ok",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

const mockKpis: SuppliesKpis = {
  total: 3,
  criticos: 1,
  bajos: 1,
  ok: 1,
  valorTotalCop: 70500,
};

describe("SuppliesManager Component", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/admin/insumos")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ supplies: mockSupplies, kpis: mockKpis }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renderiza correctamente los KPIs del semáforo de inventario", () => {
    render(<SuppliesManager initialSupplies={mockSupplies} initialKpis={mockKpis} />);

    expect(screen.getByText("Total Insumos")).toBeInTheDocument();
    expect(screen.getByText("Críticos / Agotados")).toBeInTheDocument();
    expect(screen.getAllByText("Stock Bajo")[0]).toBeInTheDocument();
    expect(screen.getByText("Valor Estimado")).toBeInTheDocument();

    // Check KPI counts
    expect(screen.getAllByText("3")[0]).toBeInTheDocument(); // total
  });

  it("muestra las tarjetas de insumos con sus nombres, categoría y badges", () => {
    render(<SuppliesManager initialSupplies={mockSupplies} initialKpis={mockKpis} />);

    expect(screen.getByText("Ron Medellín 3 Años 750ml")).toBeInTheDocument();
    expect(screen.getByText("Pulpa Maracuyá 1kg")).toBeInTheDocument();
    expect(screen.getByText("Vasos 16 oz")).toBeInTheDocument();

    expect(screen.getByText("Crítico")).toBeInTheDocument();
    expect(screen.getByText("Bajo")).toBeInTheDocument();
    expect(screen.getByText("OK")).toBeInTheDocument();
  });

  it("filtra insumos por categoría", () => {
    render(<SuppliesManager initialSupplies={mockSupplies} initialKpis={mockKpis} />);

    // Click on "Pulpas" category filter
    const pulpaButton = screen.getByRole("button", { name: "Pulpas" });
    fireEvent.click(pulpaButton);

    expect(screen.getByText("Pulpa Maracuyá 1kg")).toBeInTheDocument();
    expect(screen.queryByText("Ron Medellín 3 Años 750ml")).not.toBeInTheDocument();
    expect(screen.queryByText("Vasos 16 oz")).not.toBeInTheDocument();
  });

  it("filtra insumos en tiempo real mediante el buscador", () => {
    render(<SuppliesManager initialSupplies={mockSupplies} initialKpis={mockKpis} />);

    const searchInput = screen.getByPlaceholderText(/Buscar insumo/i);
    fireEvent.change(searchInput, { target: { value: "Ron" } });

    expect(screen.getByText("Ron Medellín 3 Años 750ml")).toBeInTheDocument();
    expect(screen.queryByText("Pulpa Maracuyá 1kg")).not.toBeInTheDocument();
    expect(screen.queryByText("Vasos 16 oz")).not.toBeInTheDocument();
  });

  it("abre el modal de movimiento al pulsar '+ Entrada'", () => {
    render(<SuppliesManager initialSupplies={mockSupplies} initialKpis={mockKpis} />);

    const entradaButtons = screen.getAllByRole("button", { name: "+ Entrada" });
    fireEvent.click(entradaButtons[0]);

    expect(screen.getByText(/Registrar Movimiento en Ron Medellín 3 Años 750ml/i)).toBeInTheDocument();
    expect(screen.getByText("Tipo de Movimiento")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeInTheDocument();
  });
});
