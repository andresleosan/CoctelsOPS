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

import { RecipeEditor } from "@/components/admin/RecipeEditor";
import type { RecipeCatalogProduct } from "@/lib/recipes/profitability";
import type { ProductRecipe } from "@/types/recipes";
import type { SupplyItem } from "@/types/supplies";

const supplies: SupplyItem[] = [
  {
    id: "sup-ron",
    negocioId: "coctels-ops",
    name: "Ron Blanco",
    category: "licor",
    unit: "ml",
    currentStock: 1500,
    minStock: 300,
    costPerUnit: 100, // 1 oz (30ml) = 3.000 COP
    status: "ok",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "sup-pulpa",
    negocioId: "coctels-ops",
    name: "Pulpa Fresa",
    category: "pulpa",
    unit: "ml",
    currentStock: 2000,
    minStock: 400,
    costPerUnit: 25,
    status: "ok",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const products: RecipeCatalogProduct[] = [
  {
    id: "prod-v2",
    name: "Daiquiri Fresa",
    category: "cocktail",
    price: null,
    active: true,
    sizes: [
      { id: "sz-14", label: "14 oz", priceCop: 12000 },
      { id: "sz-24", label: "24 oz", priceCop: 24000 },
    ],
    addOns: [{ id: "ad-1", name: "Shot extra", priceCop: 5000 }],
  },
];

const existingRecipes: ProductRecipe[] = [
  {
    id: "rec-existing",
    negocioId: "coctels-ops",
    productId: "prod-v2",
    productName: "Daiquiri Fresa",
    presentation: "24 oz",
    presentationKey: "24 oz",
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

describe("RecipeEditor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("calcula escandallo en vivo con presets táctiles, alerta baja rentabilidad y evita distorsión por adiciones opcionales", () => {
    render(
      <RecipeEditor
        mode="create"
        products={products}
        supplies={supplies}
        existingRecipes={existingRecipes}
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // 14 oz ($12.000), Ron Blanco 30ml * 100 = $3.000 -> Margen 75% (Saludable)
    expect(screen.getByText("$12.000")).toBeInTheDocument();
    expect(screen.getAllByText("$3.000").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("Saludable")).toBeInTheDocument();

    // Agregar adición opcional (Shot extra = 30ml Ron = $3.000): NO debe cambiar el costo base ni margen base
    fireEvent.click(screen.getByRole("button", { name: /Shot extra/i }));
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText(/Costo adicional total de adiciones configuradas/i)).toBeInTheDocument();

    // Cambiar unidad a oz y usar preset de 2 oz (2 * 30ml * 100 = $6.000; margen 50%) -> aún saludable; subir a 3 oz ($9.000 -> 25% crítico)
    fireEvent.change(screen.getAllByLabelText("Unidad")[0], { target: { value: "oz" } });
    fireEvent.click(screen.getByRole("button", { name: /Fijar 2 oz/i }));
    expect(screen.getAllByText("$6.000").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("50%")).toBeInTheDocument();

    fireEvent.change(screen.getAllByLabelText("Cantidad")[0], { target: { value: "3" } });
    expect(screen.getAllByText("$9.000").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText(/Alerta crítica de rentabilidad/i)).toBeInTheDocument();
    expect(screen.getByText("$22.500")).toBeInTheDocument();
  });

  it("advierte presentación duplicada y bloquea envío cuando hay insumos repetidos", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <RecipeEditor
        mode="create"
        products={products}
        supplies={supplies}
        existingRecipes={existingRecipes}
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Seleccionar presentación 24 oz ya existente
    fireEvent.change(screen.getByLabelText("Presentación / Vaso"), {
      target: { value: "24 oz" },
    });
    expect(screen.getByText(/Ya existe una receta para/i)).toBeInTheDocument();

    // Agregar insumo base (elige Pulpa Fresa), luego cambiarlo a Ron Blanco para forzar duplicado
    fireEvent.click(screen.getByRole("button", { name: /Agregar insumo base/i }));
    fireEvent.change(screen.getByLabelText("Insumo #2"), {
      target: { value: "sup-ron" },
    });

    expect(screen.getByText(/Hay un insumo repetido en la lista base/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Guardar Receta/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/insumos duplicados/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envía POST al crear y PATCH al editar, mostrando errores HTTP del servidor", async () => {
    const onSaved = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Conflicto simulado" }), { status: 409 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ recipe: { ...existingRecipes[0], presentation: "14 oz" } }), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(
      <RecipeEditor
        mode="create"
        products={products}
        supplies={supplies}
        onSaved={onSaved}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Guardar Receta/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Conflicto simulado");
    expect(onSaved).not.toHaveBeenCalled();
    unmount();

    render(
      <RecipeEditor
        mode="edit"
        initialRecipe={existingRecipes[0]}
        products={products}
        supplies={supplies}
        onSaved={onSaved}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Actualizar Receta/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/admin/recetas/rec-existing",
        expect.objectContaining({ method: "PATCH" })
      );
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
  });
});
