import {
  DEFAULT_CATALOG_PLACEHOLDER,
  isAllowedCatalogImage,
} from "@/lib/catalog/image-hosts";
import { productInputSchema } from "@/lib/validation/catalog";
import type { CategoryInput, ProductInput } from "@/types/catalog";

export type StarterCatalogTemplateItem = {
  key: string;
  product: Omit<ProductInput, "negocioId">;
};

export const STARTER_CATEGORIES: ReadonlyArray<{ id: string; input: CategoryInput }> = [
  { id: "granizado", input: { name: "Granizados", active: true, order: 1 } },
  { id: "cocktail", input: { name: "Cocteles", active: true, order: 2 } },
  { id: "special", input: { name: "Especiales", active: true, order: 3 } },
];

export const STARTER_CATALOG_TEMPLATE: readonly StarterCatalogTemplateItem[] = [
  {
    key: "granizado-fresa-salvaje",
    product: {
      name: "Granizado Fresa Salvaje",
      description: "Granizado de fresa natural con toque cítrico de limón y fruta fresca picada.",
      price: 10000,
      image: DEFAULT_CATALOG_PLACEHOLDER,
      category: "granizado",
      availableSizes: [
        { name: "8 oz", price: 10000 },
        { name: "16 oz", price: 15000 },
        { name: "24 oz", price: 25000 },
      ],
      availableFlavors: ["Fresa", "Mora", "Limón"],
      availableAddOns: [
        { name: "Leche Condensada", price: 1000 },
        { name: "Gomitas", price: 1500 },
        { name: "Fruta Picada Extra", price: 2000 },
      ],
      stock: 50,
      active: true,
      featured: true,
    },
  },
  {
    key: "granizado-mango-biche",
    product: {
      name: "Granizado Mango Biche",
      description: "Mango biche colombiano con sal, limón fresco y un toque picante de la casa.",
      price: 10000,
      image: DEFAULT_CATALOG_PLACEHOLDER,
      category: "granizado",
      availableSizes: [
        { name: "8 oz", price: 10000 },
        { name: "16 oz", price: 15000 },
        { name: "24 oz", price: 25000 },
      ],
      availableFlavors: ["Mango Biche", "Limón"],
      availableAddOns: [
        { name: "Sal de Gusano", price: 1500 },
        { name: "Chamoy", price: 1000 },
      ],
      stock: 50,
      active: true,
      featured: true,
    },
  },
  {
    key: "granizado-maracuya-ops",
    product: {
      name: "Explosión de Maracuyá",
      description: "Granizado intenso de maracuyá artesanal con pulpa natural y semillas crocantes.",
      price: 10000,
      image: DEFAULT_CATALOG_PLACEHOLDER,
      category: "granizado",
      availableSizes: [
        { name: "8 oz", price: 10000 },
        { name: "16 oz", price: 15000 },
        { name: "24 oz", price: 25000 },
      ],
      availableFlavors: ["Maracuyá", "Hierbabuena"],
      availableAddOns: [
        { name: "Leche Condensada", price: 1000 },
        { name: "Gomitas", price: 1500 },
      ],
      stock: 40,
      active: true,
      featured: false,
    },
  },
  {
    key: "coctel-coco-loco",
    product: {
      name: "Coco Loco Tropical",
      description: "Cóctel frío de coco y piña con balance tropical listo para disfrutar.",
      price: 15000,
      image: DEFAULT_CATALOG_PLACEHOLDER,
      category: "cocktail",
      availableSizes: [{ name: "14 oz", price: 15000 }],
      availableFlavors: ["Coco", "Piña", "Maracuyá"],
      availableAddOns: [
        { name: "Coco Rallado", price: 1000 },
        { name: "Cereza", price: 500 },
      ],
      stock: 35,
      active: true,
      featured: true,
    },
  },
  {
    key: "coctel-mojito-frutos-rojos",
    product: {
      name: "Mojito Frutos Rojos",
      description: "Cóctel refrescante con hierbabuena macerada, frutos rojos y toque cítrico.",
      price: 15000,
      image: DEFAULT_CATALOG_PLACEHOLDER,
      category: "cocktail",
      availableSizes: [{ name: "14 oz", price: 15000 }],
      availableFlavors: ["Frutos Rojos", "Hierbabuena", "Limón"],
      availableAddOns: [
        { name: "Shot Extra", price: 4000 },
        { name: "Gomitas", price: 1500 },
      ],
      stock: 35,
      active: true,
      featured: false,
    },
  },
  {
    key: "especial-soda-italiana-frutal",
    product: {
      name: "Soda Italiana Frutal",
      description: "Bebida burbujeante sin licor con sirope artesanal de frutas y perlas explosivas.",
      price: 12000,
      image: DEFAULT_CATALOG_PLACEHOLDER,
      category: "special",
      availableSizes: [{ name: "16 oz", price: 12000 }],
      availableFlavors: ["Manzana Verde", "Sandía", "Lychee"],
      availableAddOns: [
        { name: "Perlas Explosivas", price: 2000 },
        { name: "Cereza", price: 500 },
      ],
      stock: 40,
      active: true,
      featured: false,
    },
  },
];

function slugifySegment(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildTenantClonedProductId(negocioId: string, templateKey: string): string {
  const cleanNegocio = slugifySegment(negocioId).slice(0, 32) || "local";
  const cleanKey = slugifySegment(templateKey).slice(0, 44) || "producto";
  const combined = `${cleanNegocio}-${cleanKey}`.slice(0, 80).replace(/^-+|-+$/g, "");
  return combined || "producto-base";
}

export function sanitizeClonedProductInput(
  source: ProductInput,
  targetNegocioId: string,
): ProductInput {
  const safeImage = isAllowedCatalogImage(source.image)
    ? source.image
    : DEFAULT_CATALOG_PLACEHOLDER;

  return productInputSchema.parse({
    ...source,
    image: safeImage,
    negocioId: targetNegocioId,
  });
}
