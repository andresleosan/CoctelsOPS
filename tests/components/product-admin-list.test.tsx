import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUser = { getIdToken: vi.fn().mockResolvedValue("fake-token") };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/productos",
}));

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

vi.mock("@/components/admin/PermissionGate", () => ({
  PermissionGate: ({ children }: { children: React.ReactNode }) => <div data-testid="permission-gate">{children}</div>,
}));

import ProductsPage from "@/app/admin/productos/page";

const mockProducts = [
  {
    id: "fresa-salvaje",
    name: "Fresa Salvaje",
    description: "Granizado de fresa natural.",
    price: 15000,
    image: "/catalog-placeholder.svg",
    category: "granizado" as const,
    availableSizes: [{ name: "16 oz", price: 15000 }],
    availableFlavors: ["Fresa", "Limón"],
    availableAddOns: [],
    stock: 10,
    active: true,
    featured: true,
  },
  {
    id: "mojito-classic",
    name: "Mojito Clásico",
    description: "Cóctel con ron y hierbabuena.",
    price: 22000,
    image: "/catalog-placeholder.svg",
    category: "cocktail" as const,
    availableSizes: [],
    availableFlavors: ["Menta"],
    availableAddOns: [],
    stock: 0,
    active: false,
    featured: false,
  },
];

describe("ProductsPage (Panel Staff Menú)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, options?: { method?: string; body?: string }) => {
        if (url.includes("/api/admin/productos") && (!options || !options.method || options.method === "GET")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ products: mockProducts }),
          });
        }
        if (options?.method === "PATCH") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ product: { ...mockProducts[0], ...JSON.parse(options.body ?? "{}") } }),
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

  it("renderiza la lista de productos con badges de stock, precios en COP y sabores", async () => {
    render(<ProductsPage />);

    await waitFor(() => {
      expect(screen.getByText("Fresa Salvaje")).toBeInTheDocument();
      expect(screen.getByText("Mojito Clásico")).toBeInTheDocument();
    });

    // Precios formateados en COP
    expect(screen.getByText(/\$15\.000/i)).toBeInTheDocument();
    expect(screen.getByText(/\$22\.000/i)).toBeInTheDocument();

    // Badges de stock y estado
    expect(screen.getByText("Stock: 10")).toBeInTheDocument();
    expect(screen.getByText("Agotado")).toBeInTheDocument();

    // Sabores visibles
    expect(screen.getByText("Fresa")).toBeInTheDocument();
    expect(screen.getByText("Limón")).toBeInTheDocument();
  });

  it("permite filtrar productos por nombre en tiempo real", async () => {
    render(<ProductsPage />);

    await waitFor(() => {
      expect(screen.getByText("Fresa Salvaje")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Buscar por nombre o categoría/i);
    fireEvent.change(searchInput, { target: { value: "Mojito" } });

    expect(screen.queryByText("Fresa Salvaje")).not.toBeInTheDocument();
    expect(screen.getByText("Mojito Clásico")).toBeInTheDocument();
  });

  it("permite cambiar disponibilidad de stock en 1-tap llamando a PATCH", async () => {
    render(<ProductsPage />);

    await waitFor(() => {
      expect(screen.getByText("Fresa Salvaje")).toBeInTheDocument();
    });

    // Fresa Salvaje tiene stock 10 -> botón dice "Agotar"
    const agotarBtn = screen.getByRole("button", { name: "Marcar Fresa Salvaje como agotado" });
    fireEvent.click(agotarBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/admin/productos/fresa-salvaje"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ stock: 0 }),
        })
      );
    });
  });

  it("permite pausar y activar visibilidad de un producto en 1-tap", async () => {
    render(<ProductsPage />);

    await waitFor(() => {
      expect(screen.getByText("Fresa Salvaje")).toBeInTheDocument();
    });

    // Fresa Salvaje está activo -> botón dice "Pausar"
    const pausarBtn = screen.getByRole("button", { name: "Pausar Fresa Salvaje" });
    fireEvent.click(pausarBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/admin/productos/fresa-salvaje"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ active: false }),
        })
      );
    });
  });
});
