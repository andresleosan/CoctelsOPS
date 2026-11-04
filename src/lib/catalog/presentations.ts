import type { Product, ProductSize } from "@/types/catalog";

export const DEFAULT_GRANIZADO_SIZES: readonly ProductSize[] = [
  { name: "8 oz", price: 10000 },
  { name: "16 oz", price: 15000 },
  { name: "24 oz", price: 25000 },
];

export const DEFAULT_COCKTAIL_SIZES: readonly ProductSize[] = [
  { name: "14 oz", price: 15000 },
];

/**
 * Retorna las presentaciones comerciales disponibles para un producto.
 * Si el producto define `availableSizes` en su catálogo, las usa directamente.
 * En caso contrario, asigna las presentaciones estándar de la carta oficial Canva
 * según su categoría o precio base.
 */
export function getProductSizes(
  product: Pick<Product, "availableSizes" | "category" | "price">
): ProductSize[] {
  if (product.availableSizes && product.availableSizes.length > 0) {
    return product.availableSizes;
  }

  if (product.category === "granizado") {
    return [...DEFAULT_GRANIZADO_SIZES];
  }

  if (product.category === "cocktail") {
    return [...DEFAULT_COCKTAIL_SIZES];
  }

  return [{ name: "Personal", price: product.price }];
}
