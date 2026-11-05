/* eslint-disable @next/next/no-img-element */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => <img alt={String(props.alt ?? "")} {...props} /> }));

import { ProductForm } from "@/components/admin/ProductForm";

const product = {
  id: "fresa-salvaje",
  name: "Fresa Salvaje",
  description: "Granizado de fresa natural.",
  price: 8500,
  image: "https://firebasestorage.googleapis.com/v0/b/example/o/fresa.jpg?alt=media&token=token",
  category: "granizado" as const,
  availableFlavors: ["Fresa"],
  availableSizes: [{ name: "8 oz", price: 10000 }],
  availableAddOns: [{ name: "Lecherita", price: 1500 }],
  stock: 10,
  active: true,
  featured: true,
};

describe("ProductForm gestión móvil de catálogo", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("muestra la imagen actual y actualiza el preview al seleccionar un archivo", () => {
    render(<ProductForm product={product} />);

    const preview = screen.getByRole("img", { name: "Vista previa de Fresa Salvaje" });
    expect(preview).toHaveAttribute("src", product.image);

    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "nueva.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Reemplazar imagen"), { target: { files: [file] } });

    expect(screen.getByRole("img", { name: "Vista previa de Fresa Salvaje" })).toHaveAttribute("src", "blob:preview");
  });

  it("muestra el placeholder oficial por defecto al crear un nuevo producto", () => {
    render(<ProductForm />);

    const preview = screen.getByRole("img", { name: "Vista previa de producto" });
    expect(preview).toHaveAttribute("src", "/catalog-placeholder.svg");
    expect(screen.getByText("Placeholder oficial")).toBeInTheDocument();
  });

  it("muestra un error en cliente si el archivo supera los 5 MB", () => {
    render(<ProductForm product={product} />);

    const largeFile = new File([new Uint8Array(5 * 1024 * 1024 + 10)], "pesada.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Reemplazar imagen"), { target: { files: [largeFile] } });

    expect(screen.getByText(/La imagen supera el límite de 5 MB/i)).toBeInTheDocument();
  });

  it("muestra un error en cliente si el formato no es JPEG, PNG o WebP", () => {
    render(<ProductForm product={product} />);

    const gifFile = new File([new Uint8Array([1, 2, 3])], "animacion.gif", { type: "image/gif" });
    fireEvent.change(screen.getByLabelText("Reemplazar imagen"), { target: { files: [gifFile] } });

    expect(screen.getByText(/Solo se aceptan imágenes en formato JPEG, PNG o WebP/i)).toBeInTheDocument();
  });

  it("permite restablecer la imagen al placeholder de marca", () => {
    render(<ProductForm product={product} />);

    const resetBtn = screen.getByRole("button", { name: /Usar placeholder/i });
    fireEvent.click(resetBtn);

    const preview = screen.getByRole("img", { name: "Vista previa de Fresa Salvaje" });
    expect(preview).toHaveAttribute("src", "/catalog-placeholder.svg");
    expect(screen.getByText("Placeholder oficial")).toBeInTheDocument();
  });

  it("dispone de botón accesible para captura directa con cámara", () => {
    render(<ProductForm product={product} />);

    expect(screen.getByRole("button", { name: /Tomar foto con cámara/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Tomar foto con cámara")).toHaveAttribute("capture", "environment");
  });

  it("permite agregar y remover chips de sabores", () => {
    render(<ProductForm product={product} />);

    // Fresa inicial presente
    expect(screen.getByText("Fresa")).toBeInTheDocument();

    // Agregar nuevo sabor
    const input = screen.getByPlaceholderText(/Maracuyá, Fresa/i);
    fireEvent.change(input, { target: { value: "Maracuyá" } });
    fireEvent.click(screen.getByRole("button", { name: /Agregar sabor/i }));

    expect(screen.getByText("Maracuyá")).toBeInTheDocument();

    // Eliminar el sabor Fresa
    const removeFresaButton = screen.getByRole("button", { name: "Eliminar sabor Fresa" });
    fireEvent.click(removeFresaButton);

    expect(screen.queryByText("Fresa")).not.toBeInTheDocument();
    expect(screen.getByText("Maracuyá")).toBeInTheDocument();
  });

  it("permite agregar y remover presentaciones con precios en COP", () => {
    render(<ProductForm product={product} />);

    expect(screen.getByDisplayValue("8 oz")).toBeInTheDocument();

    // Agregar nuevo tamaño
    fireEvent.click(screen.getByRole("button", { name: /Agregar tamaño/i }));

    const inputs = screen.getAllByPlaceholderText(/16 oz, 24 oz/i);
    expect(inputs.length).toBe(2);

    fireEvent.change(inputs[1]!, { target: { value: "16 oz" } });
    expect(screen.getByDisplayValue("16 oz")).toBeInTheDocument();

    // Eliminar primer tamaño
    const removeBtn = screen.getByRole("button", { name: "Eliminar tamaño 8 oz" });
    fireEvent.click(removeBtn);

    expect(screen.queryByDisplayValue("8 oz")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("16 oz")).toBeInTheDocument();
  });

  it("permite agregar y remover adiciones y toppings", () => {
    render(<ProductForm product={product} />);

    expect(screen.getByDisplayValue("Lecherita")).toBeInTheDocument();

    // Agregar nueva adición
    fireEvent.click(screen.getByRole("button", { name: /Agregar adición/i }));

    const inputs = screen.getAllByPlaceholderText(/Gomitas, Chamoy/i);
    expect(inputs.length).toBe(2);

    fireEvent.change(inputs[1]!, { target: { value: "Gomitas" } });
    expect(screen.getByDisplayValue("Gomitas")).toBeInTheDocument();

    // Eliminar Lecherita
    const removeBtn = screen.getByRole("button", { name: "Eliminar adición Lecherita" });
    fireEvent.click(removeBtn);

    expect(screen.queryByDisplayValue("Lecherita")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Gomitas")).toBeInTheDocument();
  });
});
