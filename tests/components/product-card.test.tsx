/* eslint-disable @next/next/no-img-element */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

import ProductCard from "@/components/products/ProductCard";

const sampleProduct = {
  id: "fresa-1",
  name: "Fresa Salvaje",
  description: "Granizado de fresa natural con fruta fresca picada.",
  price: 10000,
  image: "https://example.com/fresa.jpg",
  category: "granizado" as const,
  availableSizes: [
    { name: "8 oz", price: 10000 },
    { name: "16 oz", price: 15000 },
  ],
  availableFlavors: ["Fresa", "Limón"],
  availableAddOns: [{ name: "Gomitas", price: 1500 }],
  stock: 50,
  active: true,
  featured: true,
};

describe("ProductCard", () => {
  afterEach(cleanup);

  it("renderiza el nombre, descripción y precio en COP", () => {
    render(<ProductCard product={sampleProduct} />);

    expect(screen.getByText("Fresa Salvaje")).toBeInTheDocument();
    expect(screen.getByText(/Granizado de fresa natural/)).toBeInTheDocument();
    expect(screen.getByText(/10.000.*COP/)).toBeInTheDocument();
  });

  it("proporciona atributo sizes responsivo a la imagen para optimización LCP", () => {
    render(<ProductCard product={sampleProduct} />);

    const img = screen.getByRole("img", { name: sampleProduct.name });
    expect(img).toHaveAttribute("data-sizes", "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw");
  });

  it("proporciona tap target accesible y abre el personalizador al pulsar", () => {
    render(<ProductCard product={sampleProduct} />);

    const button = screen.getByRole("button", { name: `Personalizar ${sampleProduct.name}` });
    expect(button).toBeInTheDocument();
    expect(button.className).toContain("min-h-[44px]");

    const customizer = screen.getByTestId("mock-customizer");
    expect(customizer).toHaveAttribute("data-open", "false");

    fireEvent.click(button);
    expect(customizer).toHaveAttribute("data-open", "true");
  });
});
