import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: {
      uid: "admin-1",
      getIdToken: vi.fn().mockResolvedValue("fake-token"),
    },
    loading: false,
    isAdmin: true,
  }),
}));

import { RecipesManager } from "@/components/admin/RecipesManager";

const sampleProducts = [
  {
    id: "prod-mojito",
    name: "Mojito Clásico",
    description: "Refrescante",
    price: 22000,
    image: "/mojito.jpg",
    category: "cocktail",
    availableSizes: [
      { name: "16 oz", price: 22000 },
      { name: "24 oz", price: 29000 },
    ],
    availableFlavors: ["Limón"],
    availableAddOns: [{ name: "Shot extra", price: 6000 }],
    stock: 20,
    active: true,
    featured: true,
  },
];

const sampleSupplies = [
  {
    id: "sup-ron",
    negocioId: "coctels-ops",
    name: "Ron Blanco",
    category: "licor",
    unit: "ml",
    currentStock: 1500,
    minStock: 300,
    costPerUnit: 60,
    status: "ok",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const sampleRecipes = [
  {
    id: "rec-1",
    negocioId: "coctels-ops",
    productId: "prod-mojito",
    productName: "Mojito Clásico",
    presentation: "16 oz",
    presentationKey: "16 oz",
    ingredients: [
      {
        supplyId: "sup-ron",
        supplyName: "Ron Blanco",
        supplyUnit: "ml",
        quantity: 2,
        unit: "oz",
      },
    ],
    addOnIngredients: [],
    yieldUnits: 1,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

describe("RecipesManager", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders recipes with live escandallo cost and allows creating a new recipe", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/admin/recetas") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ recipes: sampleRecipes }), { status: 200 });
      }
      if (url.endsWith("/api/admin/productos")) {
        return new Response(JSON.stringify({ products: sampleProducts }), { status: 200 });
      }
      if (url.endsWith("/api/admin/insumos")) {
        return new Response(JSON.stringify({ supplies: sampleSupplies }), { status: 200 });
      }
      if (url.endsWith("/api/admin/recetas") && init?.method === "POST") {
        return new Response(JSON.stringify({ recipe: { ...sampleRecipes[0], id: "rec-2", presentation: "24 oz" } }), {
          status: 201,
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<RecipesManager />);

    expect(await screen.findByText("Mojito Clásico")).toBeTruthy();
    // 2 oz * 30 ml * 60 COP = 3.600
    expect(screen.getAllByText("$3.600").length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: /nueva receta/i }));
    expect(await screen.findByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /guardar receta/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/recetas",
        expect.objectContaining({ method: "POST" })
      );
    });
  });
});
