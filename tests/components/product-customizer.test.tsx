/* eslint-disable @next/next/no-img-element */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const addItemMock = vi.fn();
const toastMock = vi.fn();

vi.mock("@/context/cart-context", () => ({
  useCart: () => ({
    addItem: addItemMock,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => (
    <img alt={String(props.alt ?? "")} {...props} />
  ),
}));

import ProductCustomizer from "@/components/products/ProductCustomizer";
import type { Product } from "@/types/catalog";

const granizadoProduct: Product = {
  id: "granizado-fresa",
  name: "Fresa Salvaje",
  description: "Granizado de fresa natural.",
  price: 10000,
  image: "https://images.example.com/fresa.jpg",
  category: "granizado",
  availableSizes: [
    { name: "8 oz", price: 10000 },
    { name: "16 oz", price: 15000 },
    { name: "24 oz", price: 25000 },
  ],
  availableFlavors: ["Fresa", "Mora", "Limón"],
  availableAddOns: [
    { name: "Leche Condensada", price: 1000 },
    { name: "Gomitas", price: 1500 },
  ],
  stock: 25,
  active: true,
  featured: true,
};

describe("ProductCustomizer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("renderiza las presentaciones reales de la carta Canva sin multiplicadores ficticios", () => {
    render(
      <ProductCustomizer
        product={granizadoProduct}
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText("Fresa Salvaje")).toBeInTheDocument();
    expect(screen.getByText("Granizado de fresa natural.")).toBeInTheDocument();

    // Debe mostrar los nombres de presentación y precios exactos en COP
    expect(screen.getByText("8 oz")).toBeInTheDocument();
    expect(screen.getByText("$10.000")).toBeInTheDocument();
    expect(screen.getByText("16 oz")).toBeInTheDocument();
    expect(screen.getByText("$15.000")).toBeInTheDocument();
    expect(screen.getByText("24 oz")).toBeInTheDocument();
    expect(screen.getByText("$25.000")).toBeInTheDocument();

    // NO debe existir texto de multiplicadores 0.8 o 1.3
    expect(screen.queryByText(/0\.8/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1\.3/)).not.toBeInTheDocument();
  });

  it("calcula dinámicamente el precio real al cambiar de presentación (ej. 24 oz -> $25.000 COP)", () => {
    render(
      <ProductCustomizer
        product={granizadoProduct}
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    // Por defecto pre-selecciona 16 oz ($15.000)
    expect(
      screen.getByRole("button", { name: /Agregar al Carrito • \$15\.000/i })
    ).toBeInTheDocument();

    // Seleccionamos la presentación de 24 oz ($25.000)
    const size24Radio = screen.getByLabelText(/24 oz/i);
    fireEvent.click(size24Radio);

    // El botón debe actualizarse a $25.000 exactos
    expect(
      screen.getByRole("button", { name: /Agregar al Carrito • \$25\.000/i })
    ).toBeInTheDocument();

    // Seleccionamos la presentación de 8 oz ($10.000)
    const size8Radio = screen.getByLabelText(/8 oz/i);
    fireEvent.click(size8Radio);

    expect(
      screen.getByRole("button", { name: /Agregar al Carrito • \$10\.000/i })
    ).toBeInTheDocument();
  });

  it("suma adiciones reales al precio de la presentación sin distorsión de porcentajes", () => {
    render(
      <ProductCustomizer
        product={granizadoProduct}
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    // Presentación inicial: 16 oz ($15.000). Agregamos Gomitas (+$1.500)
    const gomitasCheckbox = screen.getByLabelText("Gomitas");
    fireEvent.click(gomitasCheckbox);

    // $15.000 + $1.500 = $16.500 exactos
    expect(
      screen.getByRole("button", { name: /Agregar al Carrito • \$16\.500/i })
    ).toBeInTheDocument();

    // Agregamos también Leche Condensada (+$1.000) -> $17.500
    const lecheCheckbox = screen.getByLabelText("Leche Condensada");
    fireEvent.click(lecheCheckbox);

    expect(
      screen.getByRole("button", { name: /Agregar al Carrito • \$17\.500/i })
    ).toBeInTheDocument();
  });

  it("envía al carrito el tamaño seleccionado, sabores, adiciones y precio final exacto", () => {
    const onOpenChange = vi.fn();
    render(
      <ProductCustomizer
        product={granizadoProduct}
        open={true}
        onOpenChange={onOpenChange}
      />
    );

    // Seleccionar 24 oz ($25.000)
    fireEvent.click(screen.getByLabelText(/24 oz/i));

    // Seleccionar sabores
    fireEvent.click(screen.getByLabelText("Fresa"));
    fireEvent.click(screen.getByLabelText("Limón"));

    // Seleccionar adición Gomitas (+$1.500)
    fireEvent.click(screen.getByLabelText("Gomitas"));

    // Clic en agregar al carrito
    const submitButton = screen.getByRole("button", {
      name: /Agregar al Carrito • \$26\.500/i,
    });
    fireEvent.click(submitButton);

    expect(addItemMock).toHaveBeenCalledTimes(1);
    expect(addItemMock).toHaveBeenCalledWith({
      productId: "granizado-fresa",
      name: "Fresa Salvaje",
      price: 26500,
      quantity: 1,
      image: "https://images.example.com/fresa.jpg",
      customization: {
        size: "24 oz",
        flavors: ["Fresa", "Limón"],
        addOns: ["Gomitas"],
      },
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "¡Agregado al carrito!",
        description: expect.stringContaining("Fresa Salvaje (24 oz)"),
      })
    );

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("deshabilita la adición cuando el producto está agotado (stock <= 0)", () => {
    const outOfStockProduct: Product = {
      ...granizadoProduct,
      stock: 0,
    };

    render(
      <ProductCustomizer
        product={outOfStockProduct}
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    const button = screen.getByRole("button", { name: /Agotado/i });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(addItemMock).not.toHaveBeenCalled();
  });

  it("usa las presentaciones por defecto de la carta Canva para productos sin availableSizes explícitos", () => {
    const productWithoutSizes: Product = {
      ...granizadoProduct,
      availableSizes: undefined,
    };

    render(
      <ProductCustomizer
        product={productWithoutSizes}
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    // Debe resolver las presentaciones estándar de granizados: 8 oz, 16 oz, 24 oz
    expect(screen.getByText("8 oz")).toBeInTheDocument();
    expect(screen.getByText("$10.000")).toBeInTheDocument();
    expect(screen.getByText("16 oz")).toBeInTheDocument();
    expect(screen.getByText("$15.000")).toBeInTheDocument();
    expect(screen.getByText("24 oz")).toBeInTheDocument();
    expect(screen.getByText("$25.000")).toBeInTheDocument();
  });
});
