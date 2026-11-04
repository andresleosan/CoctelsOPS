import type { VerifiedUser } from "@/types/auth";

export const PRODUCT_CATEGORIES = ["granizado", "cocktail", "special"] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export type ProductAddOn = {
  name: string;
  price: number;
};

export type ProductSize = {
  name: string;
  price: number;
};

export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  category: ProductCategory;
  availableSizes?: ProductSize[];
  availableFlavors: string[];
  availableAddOns: ProductAddOn[];
  stock: number;
  active: boolean;
  featured: boolean;
};

export type ProductInput = Omit<Product, "id">;

export type CatalogPermission = "productos.read" | "productos.write" | "categorias.read" | "categorias.write";
export type CatalogCaller = VerifiedUser;

export type Category = {
  id: string;
  name: string;
  active: boolean;
  order: number;
};

export type CategoryInput = Omit<Category, "id">;
