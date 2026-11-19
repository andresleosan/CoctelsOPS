import { describe, expect, it } from "vitest";

import {
  buildCatalogProfitabilityReport,
  calculateSuggestedSalePrice,
  classifyMarginHealth,
  resolveAdminProductAddOns,
  resolveAdminProductSizes,
  resolveCatalogSalePriceCop,
  type RecipeCatalogProduct,
} from "@/lib/recipes/profitability";
import type { ProductRecipe } from "@/types/recipes";
import type { SupplyItem } from "@/types/supplies";

const supplies: SupplyItem[] = [
  {
    id: "sup-ron",
    negocioId: "coctels-ops",
    name: "Ron Añejo",
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
    name: "Pulpa Maracuyá",
    category: "pulpa",
    unit: "ml",
    currentStock: 2000,
    minStock: 500,
    costPerUnit: 20, // 60ml = 1.200 COP
    status: "ok",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "sup-vaso",
    negocioId: "coctels-ops",
    name: "Vaso 16 oz",
    category: "desechable",
    unit: "unidad",
    currentStock: 100,
    minStock: 20,
    costPerUnit: 500,
    status: "ok",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const products: RecipeCatalogProduct[] = [
  {
    id: "prod-maracuya",
    name: "Granizado Maracuyá",
    category: "granizado",
    price: 10000,
    active: true,
    availableSizes: [
      { name: "8 oz", price: 10000 },
      { name: "16 oz", price: 15000 },
    ],
    availableAddOns: [{ name: "Shot extra", price: 5000 }],
  },
  {
    id: "prod-v2",
    name: "Mojito V2",
    category: "cocktail",
    price: null,
    active: true,
    sizes: [
      { id: "s1", label: "14 oz", priceCop: 12000 },
      { id: "s2", label: "24 oz", priceCop: 24000 },
    ],
    addOns: [{ id: "a1", name: "Gomitas", priceCop: 2000 }],
  },
];

const recipes: ProductRecipe[] = [
  {
    id: "rec-saludable",
    negocioId: "coctels-ops",
    productId: "prod-maracuya",
    productName: "Granizado Maracuyá",
    presentation: "16 oz",
    presentationKey: "16 oz",
    ingredients: [
      { supplyId: "sup-ron", supplyName: "Ron Añejo", supplyUnit: "ml", quantity: 1, unit: "oz" },
      { supplyId: "sup-pulpa", supplyName: "Pulpa Maracuyá", supplyUnit: "ml", quantity: 60, unit: "ml" },
      { supplyId: "sup-vaso", supplyName: "Vaso 16 oz", supplyUnit: "unidad", quantity: 1, unit: "unidad" },
    ],
    // Costo = 3.000 + 1.200 + 500 = 4.700; Venta = 15.000 => Margen = 68.7% (saludable)
    addOnIngredients: [
      { addOnName: "Shot extra", supplyId: "sup-ron", supplyName: "Ron Añejo", supplyUnit: "ml", quantity: 2, unit: "oz" },
    ],
    yieldUnits: 1,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "rec-critica",
    negocioId: "coctels-ops",
    productId: "prod-v2",
    productName: "Mojito V2",
    presentation: "14 oz",
    presentationKey: "14 oz",
    ingredients: [
      { supplyId: "sup-ron", supplyName: "Ron Añejo", supplyUnit: "ml", quantity: 3, unit: "oz" },
      // Costo = 9.000; Venta = 12.000 => Margen = 25% (critico)
    ],
    addOnIngredients: [],
    yieldUnits: 1,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

describe("recipe profitability domain", () => {
  it("clasifica salud de margen correctamente (<35 critico, <50 bajo, >=50 saludable)", () => {
    expect(classifyMarginHealth(34.9)).toBe("critico");
    expect(classifyMarginHealth(35)).toBe("bajo");
    expect(classifyMarginHealth(49.9)).toBe("bajo");
    expect(classifyMarginHealth(50)).toBe("saludable");
    expect(classifyMarginHealth(72)).toBe("saludable");
  });

  it("calcula el precio sugerido redondeado hacia arriba a múltiplos de $500 COP", () => {
    // 4.700 / (1 - 0.6) = 11.750 -> ceil a 12.000
    expect(calculateSuggestedSalePrice(4700, 60)).toBe(12000);
    // 9.000 / 0.4 = 22.500 -> exacto 22.500
    expect(calculateSuggestedSalePrice(9000, 60)).toBe(22500);
    expect(calculateSuggestedSalePrice(0, 60)).toBe(0);
  });

  it("resuelve tamaños, adiciones y precios de catálogo V1 y V2", () => {
    expect(resolveAdminProductSizes(products[0])).toEqual([
      { name: "8 oz", price: 10000 },
      { name: "16 oz", price: 15000 },
    ]);
    expect(resolveAdminProductSizes(products[1])).toEqual([
      { name: "14 oz", price: 12000 },
      { name: "24 oz", price: 24000 },
    ]);
    expect(resolveAdminProductAddOns(products[1])).toEqual([{ name: "Gomitas", price: 2000 }]);
    expect(resolveCatalogSalePriceCop(products[1], "14oz")).toBe(12000);
  });

  it("construye el reporte de rentabilidad de carta ordenando por peor margen, detectando insumo clave y brechas", () => {
    const report = buildCatalogProfitabilityReport({ recipes, products, supplies });

    expect(report.summary.activeRecipeCount).toBe(2);
    expect(report.summary.coveredProductCount).toBe(2);
    expect(report.summary.totalActiveProducts).toBe(2);
    expect(report.summary.lowMarginCount).toBe(1);
    expect(report.summary.criticalMarginCount).toBe(1);

    // Ordenado de menor a mayor margen (Mojito V2 25% primero, Granizado Maracuyá 68.7% después)
    expect(report.items[0]).toMatchObject({
      recipeId: "rec-critica",
      productName: "Mojito V2",
      unitCostCop: 9000,
      salePriceCop: 12000,
      grossMarginPct: 25,
      health: "critico",
      suggestedPriceCop: 22500,
      topCostSupplyName: "Ron Añejo",
      topCostSharePct: 100,
    });

    // Verifica que addOnIngredients no distorsionen el costo base (4.700, no 10.700)
    expect(report.items[1]).toMatchObject({
      recipeId: "rec-saludable",
      unitCostCop: 4700,
      grossMarginPct: 68.7,
      health: "saludable",
      topCostSupplyName: "Ron Añejo",
    });

    expect(report.lowMarginAlerts).toHaveLength(1);
    expect(report.lowMarginAlerts[0]?.recipeId).toBe("rec-critica");

    expect(report.uncoveredPresentations).toEqual([
      { productId: "prod-maracuya", productName: "Granizado Maracuyá", presentation: "8 oz", salePriceCop: 10000 },
      { productId: "prod-v2", productName: "Mojito V2", presentation: "24 oz", salePriceCop: 24000 },
    ]);
  });
});
