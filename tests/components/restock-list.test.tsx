import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RestockListCard } from "@/components/admin/RestockListCard";
import {
  buildRestockList,
  buildWhatsAppShareUrl,
  calculateSuggestedRestockQuantity,
  formatSupplierWhatsAppMessage,
} from "@/lib/inventory/restock-list";
import type { SupplyItem } from "@/types/supplies";

const mockUser = { getIdToken: vi.fn().mockResolvedValue("test-token") };

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    isAdmin: true,
  }),
}));

const sampleSupplies: SupplyItem[] = [
  {
    id: "sup-1",
    negocioId: "coctels-ops",
    name: "Ron Medellín 3 Años 750ml",
    category: "licor",
    unit: "botella",
    currentStock: 0,
    minStock: 3,
    costPerUnit: 40000,
    supplier: "Distribuidora FLA",
    status: "critico",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "sup-2",
    negocioId: "coctels-ops",
    name: "Pulpa Maracuyá",
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
    name: "Vodka Absolut",
    category: "licor",
    unit: "botella",
    currentStock: 1,
    minStock: 2,
    costPerUnit: 65000,
    supplier: "Distribuidora FLA",
    status: "bajo",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "sup-4",
    negocioId: "coctels-ops",
    name: "Vasos 16 oz",
    category: "desechable",
    unit: "unidad",
    currentStock: 200,
    minStock: 40,
    costPerUnit: 350,
    supplier: "Desechables Antioquia",
    status: "ok",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

describe("restock-list pure logic", () => {
  it("calcula la cantidad sugerida para llevar el insumo a 2x el mínimo", () => {
    const result = calculateSuggestedRestockQuantity(
      { currentStock: 0, minStock: 3, unit: "botella" },
      2
    );
    expect(result.targetStock).toBe(6);
    expect(result.deficit).toBe(6);
    expect(result.suggestedQuantity).toBe(6);
  });

  it("filtra insumos en estado OK y agrupa críticos y bajos por proveedor", () => {
    const summary = buildRestockList(sampleSupplies, { targetMultiplier: 2 });

    expect(summary.totalItems).toBe(3);
    expect(summary.criticosCount).toBe(1);
    expect(summary.bajosCount).toBe(2);
    expect(summary.groups).toHaveLength(2);

    // Distribuidora FLA tiene un crítico, debe ir primero
    expect(summary.groups[0].supplier).toBe("Distribuidora FLA");
    expect(summary.groups[0].items).toHaveLength(2);
    expect(summary.groups[0].items[0].supply.id).toBe("sup-1");
    expect(summary.groups[0].items[0].priority).toBe("critico");
    // Ron: 6 * 40000 = 240000; Vodka: (4 - 1) * 65000 = 195000 => 435000
    expect(summary.groups[0].totalEstimatedCop).toBe(435000);

    // Pulpas del Campo: (6 - 1.5) = 4.5 -> ceil = 5 * 12000 = 60000
    expect(summary.groups[1].supplier).toBe("Pulpas del Campo");
    expect(summary.totalEstimatedCop).toBe(495000);
  });

  it("formatea el mensaje de WhatsApp y normaliza teléfonos colombianos", () => {
    const summary = buildRestockList(sampleSupplies);
    const message = formatSupplierWhatsAppMessage(summary.groups[0], {
      storeName: "Coctels OPS",
    });

    expect(message).toContain("Distribuidora FLA");
    expect(message).toContain("*6 botella* — Ron Medellín 3 Años 750ml [URGENTE]");
    expect(message).toContain("*3 botella* — Vodka Absolut");
    expect(message).toContain("435.000");

    const urlWithPhone = buildWhatsAppShareUrl(message, "300 123 4567");
    expect(urlWithPhone.startsWith("https://wa.me/573001234567?text=")).toBe(true);

    const urlWithoutPhone = buildWhatsAppShareUrl(message);
    expect(urlWithoutPhone.startsWith("https://wa.me/?text=")).toBe(true);
  });
});

describe("RestockListCard component", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renderiza los grupos por proveedor y omite los insumos en estado OK", () => {
    render(<RestockListCard initialSupplies={sampleSupplies} />);

    expect(screen.getByText("Lista de Compras Automática")).toBeInTheDocument();
    expect(screen.getByText("Distribuidora FLA")).toBeInTheDocument();
    expect(screen.getByText("Pulpas del Campo")).toBeInTheDocument();
    expect(screen.queryByText("Vasos 16 oz")).not.toBeInTheDocument();
  });

  it("permite cambiar a 3x Mínimo y editar cantidades actualizando el enlace de WhatsApp", () => {
    render(<RestockListCard initialSupplies={sampleSupplies} />);

    const picoButton = screen.getByRole("button", { name: /3x Mínimo/i });
    fireEvent.click(picoButton);

    const ronInput = screen.getByLabelText("Cantidad a pedir de Ron Medellín 3 Años 750ml") as HTMLInputElement;
    expect(ronInput.value).toBe("9");

    fireEvent.change(ronInput, { target: { value: "10" } });
    expect(ronInput.value).toBe("10");

    const phoneInput = screen.getByLabelText("Teléfono WhatsApp de Distribuidora FLA");
    fireEvent.change(phoneInput, { target: { value: "3115556677" } });

    const waLinks = screen.getAllByRole("link", { name: /Enviar por WhatsApp/i });
    expect(waLinks[0].getAttribute("href")).toContain("https://wa.me/573115556677?text=");
    expect(decodeURIComponent(waLinks[0].getAttribute("href") ?? "")).toContain("10 botella");
  });

  it("muestra estado óptimo cuando no hay insumos críticos ni bajos", () => {
    const okOnly = sampleSupplies.filter((s) => s.status === "ok");
    render(<RestockListCard initialSupplies={okOnly} />);

    expect(screen.getByText("Todo el inventario está en niveles óptimos")).toBeInTheDocument();
  });
});
