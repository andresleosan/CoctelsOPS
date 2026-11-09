/* eslint-disable @next/next/no-img-element */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => (
    <img
      alt={String(props.alt ?? "")}
      src={String(props.src ?? "")}
      data-sizes={props.sizes as string}
    />
  ),
}));

vi.mock("@/components/products/ProductCustomizer", () => ({
  default: ({ open }: { open: boolean }) => (
    <div data-testid="mock-customizer" data-open={open ? "true" : "false"} />
  ),
}));

import ProductCatalogBrowser, { getCategoryIcon } from "@/components/products/ProductCatalogBrowser";
import type { Category, Product } from "@/types/catalog";

const sampleCategories: Category[] = [
  { id: "granizado", name: "Granizados", active: true, order: 1 },
  { id: "cocktail", name: "Cocteles", active: true, order: 2 },
  { id: "malteada", name: "Malteadas", active: true, order: 3 },
];

const sampleProducts: Product[] = [
  {
    id: "fresa-1",
    name: "Fresa Salvaje",
    description: "Granizado de fresa natural con fruta picada.",
    price: 10000,
    image: "https://example.com/fresa.jpg",
    category: "granizado",
    availableSizes: [
      { name: "8 oz", price: 10000 },
      { name: "16 oz", price: 15000 },
    ],
    availableFlavors: ["Fresa", "Limón"],
    availableAddOns: [{ name: "Gomitas", price: 1500 }],
    stock: 50,
    active: true,
    featured: true,
  },
  {
    id: "mango-2",
    name: "Mango Biche Special",
    description: "Granizado cítrico con sal y limón.",
    price: 10000,
    image: "https://example.com/mango.jpg",
    category: "granizado",
    availableSizes: [{ name: "16 oz", price: 15000 }],
    availableFlavors: ["Mango Biche"],
    availableAddOns: [],
    stock: 30,
    active: true,
    featured: false,
  },
  {
    id: "coco-3",
    name: "Coco Loco Tropical",
    description: "Coctel refrescante con notas de ron y coco.",
    price: 18000,
    image: "https://example.com/coco.jpg",
    category: "cocktail",
    availableSizes: [{ name: "14 oz", price: 18000 }],
    availableFlavors: ["Coco", "Piña"],
    availableAddOns: [],
    stock: 20,
    active: true,
    featured: true,
  },
];

describe("ProductCatalogBrowser", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(cleanup);

  it("renderiza la barra fija de categorías con botón 'Todos' y cada categoría", () => {
    render(<ProductCatalogBrowser products={sampleProducts} categories={sampleCategories} />);

    expect(screen.getByRole("tab", { name: "Ver todas las categorías" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Ver categoría Granizados" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Ver categoría Cocteles" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Ver categoría Malteadas" })).toBeInTheDocument();
  });

  it("agrupa los productos en secciones por categoría con anclas correspondientes", () => {
    render(<ProductCatalogBrowser products={sampleProducts} categories={sampleCategories} />);

    // Secciones presentes en el DOM
    const granizadosSection = document.getElementById("category-section-granizado");
    const coctelesSection = document.getElementById("category-section-cocktail");

    expect(granizadosSection).toBeInTheDocument();
    expect(coctelesSection).toBeInTheDocument();

    // Productos dentro de sus respectivas secciones
    expect(screen.getByText("Fresa Salvaje")).toBeInTheDocument();
    expect(screen.getByText("Mango Biche Special")).toBeInTheDocument();
    expect(screen.getByText("Coco Loco Tropical")).toBeInTheDocument();
  });

  it("al pulsar una categoría activa el tab correspondiente y llama al scroll suave a la sección", () => {
    render(<ProductCatalogBrowser products={sampleProducts} categories={sampleCategories} />);

    const coctelesTab = screen.getByRole("tab", { name: "Ver categoría Cocteles" });
    fireEvent.click(coctelesTab);

    expect(coctelesTab).toHaveAttribute("aria-selected", "true");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
  });

  it("al pulsar 'Todos' realiza scroll al inicio de la página", () => {
    render(<ProductCatalogBrowser products={sampleProducts} categories={sampleCategories} />);

    const allTab = screen.getByRole("tab", { name: "Ver todas las categorías" });
    fireEvent.click(allTab);

    expect(allTab).toHaveAttribute("aria-selected", "true");
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("filtra reactivamente los productos por nombre y por sabor", () => {
    render(<ProductCatalogBrowser products={sampleProducts} categories={sampleCategories} />);

    const searchInput = screen.getByRole("searchbox", { name: "Buscar bebidas en el menú" });

    // Filtrar por nombre
    fireEvent.change(searchInput, { target: { value: "Mango" } });
    expect(screen.getByText("Mango Biche Special")).toBeInTheDocument();
    expect(screen.queryByText("Coco Loco Tropical")).not.toBeInTheDocument();

    // Filtrar por sabor ("Piña")
    fireEvent.change(searchInput, { target: { value: "Piña" } });
    expect(screen.getByText("Coco Loco Tropical")).toBeInTheDocument();
    expect(screen.queryByText("Fresa Salvaje")).not.toBeInTheDocument();
  });

  it("permite limpiar el buscador en 1 tap restaurando todos los productos", () => {
    render(<ProductCatalogBrowser products={sampleProducts} categories={sampleCategories} />);

    const searchInput = screen.getByRole("searchbox", { name: "Buscar bebidas en el menú" });
    fireEvent.change(searchInput, { target: { value: "Mango" } });

    const clearButton = screen.getByRole("button", { name: "Limpiar búsqueda" });
    expect(clearButton).toBeInTheDocument();
    expect(clearButton.className).toContain("min-h-[44px]");

    fireEvent.click(clearButton);

    expect(searchInput).toHaveValue("");
    expect(screen.getByText("Fresa Salvaje")).toBeInTheDocument();
    expect(screen.getByText("Coco Loco Tropical")).toBeInTheDocument();
  });

  it("muestra el estado amigable cuando no hay coincidencias de búsqueda con botón para reiniciar", () => {
    render(<ProductCatalogBrowser products={sampleProducts} categories={sampleCategories} />);

    const searchInput = screen.getByRole("searchbox", { name: "Buscar bebidas en el menú" });
    fireEvent.change(searchInput, { target: { value: "SaborInexistenteXYZ" } });

    expect(screen.getByText("No encontramos lo que buscas")).toBeInTheDocument();

    const resetButton = screen.getByRole("button", { name: "Restablecer búsqueda" });
    expect(resetButton).toBeInTheDocument();
    expect(resetButton.className).toContain("min-h-[44px]");

    fireEvent.click(resetButton);
    expect(screen.getByText("Fresa Salvaje")).toBeInTheDocument();
  });

  it("cumple con los requisitos de tap targets accesibles (>= 44px) en todos los tabs", () => {
    render(<ProductCatalogBrowser products={sampleProducts} categories={sampleCategories} />);

    const tabs = screen.getAllByRole("tab");
    tabs.forEach((tab) => {
      expect(tab.className).toContain("min-h-[44px]");
    });
  });

  it("asigna los iconos correctos por categoría mediante getCategoryIcon", () => {
    expect(getCategoryIcon("granizado", "Granizados")).toBe("🍧");
    expect(getCategoryIcon("cocktail", "Cocteles")).toBe("🍸");
    expect(getCategoryIcon("soda", "Sodas")).toBe("🥤");
    expect(getCategoryIcon("malteada", "Malteadas")).toBe("🍦");
    expect(getCategoryIcon("special", "Especiales")).toBe("✨");
  });

  it("permite alternar entre vista de cuadrícula y lista compacta", () => {
    render(<ProductCatalogBrowser products={sampleProducts} categories={sampleCategories} />);

    const gridBtn = screen.getByRole("button", { name: "Vista de cuadrícula" });
    const listBtn = screen.getByRole("button", { name: "Vista de lista compacta" });

    expect(gridBtn).toBeInTheDocument();
    expect(listBtn).toBeInTheDocument();
    expect(gridBtn).toHaveAttribute("aria-pressed", "true");
    expect(listBtn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(listBtn);
    expect(listBtn).toHaveAttribute("aria-pressed", "true");
    expect(gridBtn).toHaveAttribute("aria-pressed", "false");
  });

  it("filtra productos usando los chips de filtro rápido (Populares, Con Licor)", () => {
    render(<ProductCatalogBrowser products={sampleProducts} categories={sampleCategories} />);

    // Filtro populares (fresa-1 y coco-3 son featured)
    const popularesChip = screen.getByRole("button", { name: "Populares" });
    fireEvent.click(popularesChip);

    expect(screen.getByText("Fresa Salvaje")).toBeInTheDocument();
    expect(screen.getByText("Coco Loco Tropical")).toBeInTheDocument();
    expect(screen.queryByText("Mango Biche Special")).not.toBeInTheDocument();

    // Filtro con licor (coco-3 con ron)
    const licorChip = screen.getByRole("button", { name: "Con Licor" });
    fireEvent.click(licorChip);

    expect(screen.getByText("Coco Loco Tropical")).toBeInTheDocument();
    expect(screen.queryByText("Mango Biche Special")).not.toBeInTheDocument();
    expect(screen.queryByText("Fresa Salvaje")).not.toBeInTheDocument();
  });
});
