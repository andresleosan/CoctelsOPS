import "server-only";

import { listActiveProducts } from "@/lib/firestore/products";
import { listCategories } from "@/lib/firestore/categories";
import { PRODUCTS } from "@/app/lib/products";
import type { Category, Product } from "@/types/catalog";

function isMissingFirebaseConfiguration(error: unknown): boolean {
  return error instanceof Error && /^Falta la variable FIREBASE_(PROJECT_ID|CLIENT_EMAIL|PRIVATE_KEY)$/.test(error.message);
}

export const FALLBACK_CATEGORIES: Category[] = [
  { id: "granizado", name: "Granizados", active: true, order: 1 },
  { id: "cocktail", name: "Cocteles", active: true, order: 2 },
  { id: "special", name: "Especiales", active: true, order: 3 },
];

export async function getFeaturedProducts(): Promise<Product[]> {
  try {
    const products = await listActiveProducts();
    return products.filter((product) => product.featured).slice(0, 3);
  } catch (error) {
    if (!isMissingFirebaseConfiguration(error)) throw error;
    return PRODUCTS.filter((product) => product.active && product.featured).slice(0, 3);
  }
}

export async function getHomeCategories(): Promise<Category[]> {
  try {
    const categories = await listCategories();
    return categories.length > 0 ? categories : FALLBACK_CATEGORIES;
  } catch (error) {
    if (!isMissingFirebaseConfiguration(error)) throw error;
    return FALLBACK_CATEGORIES;
  }
}
