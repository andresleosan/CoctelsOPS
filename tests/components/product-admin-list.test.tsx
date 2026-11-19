/* eslint-disable @next/next/no-img-element */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUser = { getIdToken: vi.fn().mockResolvedValue("fake-token") };

vi.mock("next/image", () => ({
  default: (props: { alt?: string; src?: string; onError?: () => void }) => (
    <img alt={props.alt ?? ""} src={props.src ?? ""} onError={props.onError} />
  ),
}));

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

  it("renderiza productos del catalogo V2 de D1 (sizes/flavors sin price plano) y actualiza stock via /api/admin/inventory", async () => {
    const v2Products = [
      {
        id: "cremoso-baileys",
        name: "El Cremoso OPS - Granizado de Baileys",
        description: "Granizado cremoso con Baileys.",
        image: "/catalog-placeholder.svg",
        category: "cat-cremosos",
        alcohol: "with",
        stock: 0,
        active: true,
        featured: true,
        sizes: [
          { id: "sz-12", label: "12 oz", volumeOz: 12, priceCop: 16000 },
          { id: "sz-16", label: "16 oz", volumeOz: 16, priceCop: 20000 },
        ],
        flavors: [{ id: "fl-1", name: "Baileys" }],
        bases: [],
        addOns: [],
      },
      {
        id: "borrador-sin-precio",
        name: "Borrador Especial",
        description: "Pendiente por definir.",
        image: "/catalog-placeholder.svg",
        category: "cat-cremosos",
        alcohol: "unknown",
        stock: 0,
        active: false,
        featured: false,
        sizes: [{ id: "sz-pending", label: "Único", volumeOz: null, priceCop: null }],
        flavors: [],
        bases: [],
        addOns: [],
      },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, options?: { method?: string }) => {
        if (url.includes("/api/admin/productos") && (!options?.method || options.method === "GET")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              products: v2Products,
              categories: [{ id: "cat-cremosos", name: "Cremosos" }],
            }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      }),
    );

    render(<ProductsPage />);

    await waitFor(() => {
      expect(screen.getByText("El Cremoso OPS - Granizado de Baileys")).toBeInTheDocument();
      expect(screen.getByText("Borrador Especial")).toBeInTheDocument();
    });

    expect(screen.getByText(/\$16\.000 COP/i)).toBeInTheDocument();
    expect(screen.getByText(/Precio pendiente/i)).toBeInTheDocument();
    expect(screen.getByText(/\(2 presentaciones\)/i)).toBeInTheDocument();
    expect(screen.getAllByText("Cremosos").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Baileys")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Marcar El Cremoso OPS - Granizado de Baileys como en stock" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/admin/inventory",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });
  });

  it("muestra vista previa de imagen por producto y pagina por sectores de 1 a 5", async () => {
    const manyProducts = Array.from({ length: 7 }, (_, index) => ({
      id: `prod-${index + 1}`,
      name: `Granizado #${index + 1}`,
      description: "Delicioso granizado.",
      price: 15000,
      image: index === 0 ? "/granizados/Fresa.png" : "",
      category: "granizado" as const,
      availableSizes: [{ name: "16 oz", price: 15000 }],
      availableFlavors: ["Fresa"],
      availableAddOns: [],
      stock: 5,
      active: true,
      featured: false,
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ products: manyProducts }),
      }),
    );

    render(<ProductsPage />);

    await waitFor(() => {
      expect(screen.getByText("Granizado #1")).toBeInTheDocument();
    });

    // Vista previa real y placeholder
    expect(screen.getByAltText("Vista previa de Granizado #1")).toHaveAttribute(
      "src",
      "/granizados/Fresa.png",
    );
    expect(screen.getByAltText("Vista previa de Granizado #2")).toHaveAttribute(
      "src",
      "/catalog-placeholder.svg",
    );

    // Sector 1: muestra 1..5 y no 6..7
    expect(screen.getByText("Granizado #5")).toBeInTheDocument();
    expect(screen.queryByText("Granizado #6")).toBeNull();
    expect(screen.getByText(/Sector 1 de 2/i)).toBeInTheDocument();

    // Ir al sector 2
    fireEvent.click(screen.getByRole("button", { name: "Sector 2" }));
    expect(screen.getByText("Granizado #6")).toBeInTheDocument();
    expect(screen.getByText("Granizado #7")).toBeInTheDocument();
    expect(screen.queryByText("Granizado #1")).toBeNull();

    // Buscar reinicia al sector 1
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre o categoría/i), {
      target: { value: "Granizado #1" },
    });
    expect(screen.getByText("Granizado #1")).toBeInTheDocument();
  });
});
