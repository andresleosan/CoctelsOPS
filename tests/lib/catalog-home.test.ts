import { beforeEach, describe, expect, it, vi } from "vitest";

const { listActiveProducts } = vi.hoisted(() => ({ listActiveProducts: vi.fn() }));
const { listCategories } = vi.hoisted(() => ({ listCategories: vi.fn() }));

vi.mock("@/lib/firestore/products", () => ({ listActiveProducts }));
vi.mock("@/lib/firestore/categories", () => ({ listCategories }));

import { FALLBACK_CATEGORIES, getFeaturedProducts, getHomeCategories } from "@/lib/catalog/home";

const product = (id: string, featured: boolean) => ({
  id,
  name: `Producto ${id}`,
  description: "Bebida de prueba",
  price: 8500,
  image: "/catalog-placeholder.svg",
  category: "granizado" as const,
  availableFlavors: ["Fresa"],
  availableAddOns: [],
  stock: 10,
  active: true,
  featured,
});

describe("getFeaturedProducts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("usa los productos destacados activos entregados por Firestore", async () => {
    listActiveProducts.mockResolvedValueOnce([product("firestore-1", true), product("firestore-2", false)]);

    await expect(getFeaturedProducts()).resolves.toEqual([product("firestore-1", true)]);
  });

  it("usa el catálogo estático solo cuando Firestore no está disponible", async () => {
    listActiveProducts.mockRejectedValueOnce(new Error("Falta la variable FIREBASE_PROJECT_ID"));

    await expect(getFeaturedProducts()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "1" }),
      expect.objectContaining({ id: "2" }),
      expect.objectContaining({ id: "3" }),
    ]));
  });

  it("no oculta errores de Firestore que no sean de configuración", async () => {
    const error = new Error("Firestore no responde");
    listActiveProducts.mockRejectedValueOnce(error);

    await expect(getFeaturedProducts()).rejects.toBe(error);
  });
});

describe("getHomeCategories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna categorías activas desde Firestore", async () => {
    const mockCategories = [
      { id: "granizado", name: "Granizados", active: true, order: 1 },
      { id: "cocktail", name: "Cocteles", active: true, order: 2 },
    ];
    listCategories.mockResolvedValueOnce(mockCategories);

    await expect(getHomeCategories()).resolves.toEqual(mockCategories);
  });

  it("retorna FALLBACK_CATEGORIES si Firestore retorna lista vacía", async () => {
    listCategories.mockResolvedValueOnce([]);

    await expect(getHomeCategories()).resolves.toEqual(FALLBACK_CATEGORIES);
  });

  it("retorna FALLBACK_CATEGORIES si Firestore carece de configuración", async () => {
    listCategories.mockRejectedValueOnce(new Error("Falta la variable FIREBASE_PROJECT_ID"));

    await expect(getHomeCategories()).resolves.toEqual(FALLBACK_CATEGORIES);
  });

  it("no oculta errores reales de Firestore", async () => {
    const error = new Error("Error interno de conexión a Firestore");
    listCategories.mockRejectedValueOnce(error);

    await expect(getHomeCategories()).rejects.toBe(error);
  });
});
