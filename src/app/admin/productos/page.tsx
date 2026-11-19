"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, RefreshCw, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import type { Product } from "@/types/catalog";

type CatalogSizeV2 = {
  id: string;
  label: string;
  volumeOz?: number | null;
  priceCop: number | null;
};

type CatalogOptionV2 = {
  id: string;
  name: string;
};

type CatalogBaseV2 = CatalogOptionV2 & {
  containsAlcohol?: boolean;
};

type CatalogAddOnV2 = CatalogOptionV2 & {
  priceCop: number;
  maxQuantity?: number;
};

type AdminProduct = Omit<Product, "price" | "availableFlavors" | "availableAddOns"> & {
  price?: number | null;
  availableFlavors?: string[];
  availableAddOns?: Product["availableAddOns"];
  sizes?: CatalogSizeV2[];
  flavors?: CatalogOptionV2[];
  bases?: CatalogBaseV2[];
  addOns?: CatalogAddOnV2[];
  alcohol?: "with" | "without" | "both" | "unknown";
};

type CategoryChoice = {
  id: string;
  name: string;
};

const DEFAULT_PAGE_SIZE = 5;
const PAGE_SIZE_OPTIONS = [5, 10, 20] as const;
const PLACEHOLDER_IMAGE = "/catalog-placeholder.svg";

function resolveProductImage(
  product: Pick<AdminProduct, "id" | "image">,
  failedImages: Record<string, true>,
): string {
  if (failedImages[product.id]) return PLACEHOLDER_IMAGE;
  const trimmed = typeof product.image === "string" ? product.image.trim() : "";
  return trimmed || PLACEHOLDER_IMAGE;
}

function buildPageNumbers(currentPage: number, totalPages: number): Array<number | "ellipsis-left" | "ellipsis-right"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const pages: Array<number | "ellipsis-left" | "ellipsis-right"> = [1];
  const windowStart = Math.max(2, currentPage - 1);
  const windowEnd = Math.min(totalPages - 1, currentPage + 1);
  if (windowStart > 2) pages.push("ellipsis-left");
  for (let page = windowStart; page <= windowEnd; page += 1) {
    pages.push(page);
  }
  if (windowEnd < totalPages - 1) pages.push("ellipsis-right");
  pages.push(totalPages);
  return pages;
}

function resolveProductPrice(product: AdminProduct): number | null {
  if (typeof product.price === "number" && Number.isFinite(product.price)) {
    return product.price;
  }
  const prices = (product.sizes ?? [])
    .map((size) => size.priceCop)
    .filter((price): price is number => typeof price === "number" && Number.isFinite(price));
  return prices.length > 0 ? Math.min(...prices) : null;
}

function resolveSizeCount(product: AdminProduct): number {
  if (Array.isArray(product.availableSizes) && product.availableSizes.length > 0) {
    return product.availableSizes.length;
  }
  return Array.isArray(product.sizes) ? product.sizes.length : 0;
}

function resolveFlavorNames(product: AdminProduct): string[] {
  if (Array.isArray(product.availableFlavors) && product.availableFlavors.length > 0) {
    return product.availableFlavors;
  }
  if (Array.isArray(product.flavors) && product.flavors.length > 0) {
    return product.flavors.map((flavor) => flavor.name);
  }
  return [];
}

export default function ProductsPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categoryNames, setCategoryNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "outOfStock">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [failedImages, setFailedImages] = useState<Record<string, true>>({});

  async function load() {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/productos", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const body = (await response.json().catch(() => ({}))) as {
        products?: AdminProduct[];
        categories?: CategoryChoice[];
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar los productos.");
      setProducts(body.products ?? []);
      if (Array.isArray(body.categories)) {
        setCategoryNames(
          Object.fromEntries(body.categories.map((category) => [category.id, category.name])),
        );
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los productos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [user]);

  async function remove(product: AdminProduct) {
    if (!user || !window.confirm(`¿Eliminar ${product.name}? Esta acción no se puede deshacer.`)) return;
    const response = await fetch(`/api/admin/productos/${encodeURIComponent(product.id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "No se pudo eliminar el producto.");
      return;
    }
    setProducts((items) => items.filter((item) => item.id !== product.id));
  }

  async function toggleStock(product: AdminProduct) {
    if (!user) return;
    const newStock = product.stock > 0 ? 0 : 10;
    const delta = newStock - product.stock;
    // Actualización optimista
    setProducts((items) =>
      items.map((item) => (item.id === product.id ? { ...item, stock: newStock } : item))
    );

    try {
      const token = await user.getIdToken();
      const response = Array.isArray(product.sizes)
        ? await fetch("/api/admin/inventory", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              productId: product.id,
              type: "ajuste",
              quantity: delta,
              reason: newStock > 0 ? "Reposición rápida desde control de menú" : "Agotado desde control de menú",
            }),
          })
        : await fetch(`/api/admin/productos/${encodeURIComponent(product.id)}`, {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ stock: newStock }),
          });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "No se pudo actualizar el stock.");
      }
    } catch (err) {
      // Reversión optimista
      setProducts((items) =>
        items.map((item) => (item.id === product.id ? { ...item, stock: product.stock } : item))
      );
      setError(err instanceof Error ? err.message : "Error al cambiar disponibilidad de stock.");
    }
  }

  async function toggleActive(product: AdminProduct) {
    if (!user) return;
    const newActive = !product.active;
    // Actualización optimista
    setProducts((items) =>
      items.map((item) => (item.id === product.id ? { ...item, active: newActive } : item))
    );

    try {
      const payload = Array.isArray(product.sizes)
        ? {
            name: product.name,
            description: product.description,
            image: product.image,
            category: product.category,
            alcohol: product.alcohol ?? "unknown",
            active: newActive,
            featured: product.featured,
            sizes: product.sizes,
            flavors: product.flavors ?? [],
            bases: product.bases ?? [],
            addOns: product.addOns ?? [],
          }
        : { active: newActive };
      const response = await fetch(`/api/admin/productos/${encodeURIComponent(product.id)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "No se pudo actualizar la visibilidad.");
      }
    } catch (err) {
      // Reversión optimista
      setProducts((items) =>
        items.map((item) => (item.id === product.id ? { ...item, active: product.active } : item))
      );
      setError(err instanceof Error ? err.message : "Error al cambiar visibilidad.");
    }
  }

  const categoryOptions = Array.from(
    new Set(products.map((product) => product.category).filter(Boolean)),
  ).map((categoryId) => ({
    id: categoryId,
    label: categoryNames[categoryId] ?? categoryId,
  }));

  const filteredProducts = products.filter((product) => {
    const categoryLabel = categoryNames[product.category] ?? product.category ?? "";
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      (product.name ?? "").toLowerCase().includes(query) ||
      categoryLabel.toLowerCase().includes(query) ||
      (product.category ?? "").toLowerCase().includes(query);
    if (!matchesSearch) return false;
    if (categoryFilter !== "all" && product.category !== categoryFilter) return false;
    if (statusFilter === "active") return product.active;
    if (statusFilter === "outOfStock") return product.stock === 0;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedProducts = filteredProducts.slice(startIndex, startIndex + pageSize);
  const rangeEnd = Math.min(startIndex + paginatedProducts.length, filteredProducts.length);
  const pageNumbers = buildPageNumbers(safePage, totalPages);

  return (
    <AdminGuard permission="productos.read">
      <div className="space-y-6">
        {/* Cabecera y botón nuevo */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">Catálogo</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">Control de Menú y Productos</h1>
            <p className="text-sm text-slate-600">
              Administra disponibilidad, stock y presentaciones de tu carta en tiempo real.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void load()}
              disabled={loading}
              className="border-slate-300 text-slate-800 min-h-[44px]"
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
            </Button>
            <PermissionGate permission="productos.write">
              <Button asChild className="bg-cyan-600 hover:bg-cyan-700 text-white min-h-[44px] font-semibold">
                <Link href="/admin/productos/nueva">
                  <Plus className="mr-1 h-4 w-4" /> Nuevo producto
                </Link>
              </Button>
            </PermissionGate>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
            {error}
          </p>
        )}

        {/* Barra de Filtros y Búsqueda Rápida para Barra */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="search"
                placeholder="Buscar por nombre o categoría..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9 bg-white border-slate-300 text-slate-900 focus:ring-cyan-500 min-h-[44px]"
              />
            </div>
            {categoryOptions.length > 1 && (
              <select
                aria-label="Filtrar por categoría"
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 focus:border-cyan-500 focus:outline-none"
              >
                <option value="all">Todas las categorías</option>
                {categoryOptions.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>
            )}
            <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("all");
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors min-h-[38px] ${
                  statusFilter === "all" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950"
                }`}
              >
                Todos ({products.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("active");
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors min-h-[38px] ${
                  statusFilter === "active" ? "bg-white text-emerald-800 shadow-sm" : "text-slate-600 hover:text-slate-950"
                }`}
              >
                Activos ({products.filter((p) => p.active).length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("outOfStock");
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors min-h-[38px] ${
                  statusFilter === "outOfStock" ? "bg-white text-red-800 shadow-sm" : "text-slate-600 hover:text-slate-950"
                }`}
              >
                Agotados ({products.filter((p) => p.stock === 0).length})
              </button>
            </div>
          </div>

          {!loading && filteredProducts.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-600">
              <p className="font-medium">
                Mostrando{" "}
                <strong className="text-slate-950">
                  {startIndex + 1}–{rangeEnd}
                </strong>{" "}
                de <strong className="text-slate-950">{filteredProducts.length}</strong> productos
                {totalPages > 1 && (
                  <span className="ml-2 text-cyan-800 font-semibold">
                    · Sector {safePage} de {totalPages}
                  </span>
                )}
              </p>
              <div className="flex items-center gap-2">
                <label htmlFor="products-page-size" className="text-xs font-medium text-slate-600">
                  Por sector:
                </label>
                <select
                  id="products-page-size"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value) || DEFAULT_PAGE_SIZE);
                    setCurrentPage(1);
                  }}
                  className="min-h-[36px] rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Lista de Productos */}
        {loading ? (
          <div className="h-48 animate-pulse rounded-xl bg-slate-200" />
        ) : filteredProducts.length === 0 ? (
          <Card className="border-dashed border-slate-300 bg-white">
            <CardContent className="p-10 text-center text-sm text-slate-600">
              No se encontraron productos coincidentes.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3">
              {paginatedProducts.map((product) => {
                const displayPrice = resolveProductPrice(product);
                const sizeCount = resolveSizeCount(product);
                const flavorNames = resolveFlavorNames(product);
                const categoryLabel = categoryNames[product.category] ?? product.category;
                const imageSrc = resolveProductImage(product, failedImages);
                const isPlaceholder = imageSrc === PLACEHOLDER_IMAGE;
                return (
                <Card key={product.id} className="border-slate-200 bg-white shadow-sm overflow-hidden">
                  <CardContent className="flex flex-col gap-4 p-4 sm:p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3.5 min-w-0">
                      <Link
                        href={`/admin/productos/${product.id}`}
                        aria-label={`Ver o editar foto de ${product.name}`}
                        className="relative h-16 w-16 sm:h-20 sm:w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-950 shadow-inner transition-transform hover:scale-[1.03]"
                      >
                        <Image
                          src={imageSrc}
                          alt={`Vista previa de ${product.name}`}
                          fill
                          unoptimized
                          sizes="80px"
                          className="object-cover"
                          onError={() =>
                            setFailedImages((prev) =>
                              prev[product.id] ? prev : { ...prev, [product.id]: true },
                            )
                          }
                        />
                        {isPlaceholder && (
                          <span className="absolute inset-x-0 bottom-0 bg-slate-950/85 py-0.5 text-center text-[10px] font-bold text-slate-200">
                            Sin foto
                          </span>
                        )}
                      </Link>

                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-bold text-slate-900 text-base sm:text-lg">{product.name}</h2>
                          <Badge
                            variant={product.active ? "default" : "secondary"}
                            className={product.active ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-slate-200 text-slate-700"}
                          >
                            {product.active ? "Activo" : "Pausado"}
                          </Badge>
                          <Badge
                            variant={product.stock > 0 ? "outline" : "destructive"}
                            className={
                              product.stock > 0
                                ? product.stock <= 5
                                  ? "border-amber-400 text-amber-800 bg-amber-50"
                                  : "border-emerald-300 text-emerald-800 bg-emerald-50"
                                : "bg-red-100 text-red-800 border-red-200"
                            }
                          >
                            {product.stock > 0 ? `Stock: ${product.stock}` : "Agotado"}
                          </Badge>
                          {product.featured && (
                            <Badge variant="outline" className="border-cyan-500 text-cyan-800 bg-cyan-50">
                              Destacado
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-600">
                          <span className="capitalize font-medium">{categoryLabel}</span> ·{" "}
                          <span className="font-bold text-slate-900">
                            {displayPrice !== null ? `$${displayPrice.toLocaleString("es-CO")} COP` : "Precio pendiente"}
                          </span>
                          {sizeCount > 0 && (
                            <span className="ml-1.5 text-xs text-slate-500">
                              ({sizeCount} {sizeCount === 1 ? "presentación" : "presentaciones"})
                            </span>
                          )}
                        </p>
                        {flavorNames.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            <span className="text-xs text-slate-500 mr-1">Sabores:</span>
                            {flavorNames.map((flavor, fIdx) => (
                              <span
                                key={fIdx}
                                className="inline-block text-[11px] font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200"
                              >
                                {flavor}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <PermissionGate permission="productos.write">
                      <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0 shrink-0">
                        {/* Switch rápido de stock */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void toggleStock(product)}
                          className={`min-h-[44px] text-xs font-semibold ${
                            product.stock > 0
                              ? "border-amber-300 text-amber-800 hover:bg-amber-50"
                              : "border-emerald-400 text-emerald-800 hover:bg-emerald-50"
                          }`}
                          aria-label={product.stock > 0 ? `Marcar ${product.name} como agotado` : `Marcar ${product.name} como en stock`}
                        >
                          {product.stock > 0 ? "Agotar" : "En Stock"}
                        </Button>

                        {/* Switch rápido de visibilidad */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void toggleActive(product)}
                          className={`min-h-[44px] text-xs font-semibold ${
                            product.active
                              ? "border-slate-300 text-slate-700 hover:bg-slate-100"
                              : "border-cyan-400 text-cyan-800 hover:bg-cyan-50"
                          }`}
                          aria-label={product.active ? `Pausar ${product.name}` : `Activar ${product.name}`}
                        >
                          {product.active ? "Pausar" : "Activar"}
                        </Button>

                        {/* Botón editar */}
                        <Button variant="outline" size="sm" asChild className="min-h-[44px] border-slate-300 text-slate-800">
                          <Link href={`/admin/productos/${product.id}`}>
                            <Pencil className="h-4 w-4 mr-1" /> Editar
                          </Link>
                        </Button>

                        {/* Botón eliminar */}
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => void remove(product)}
                          className="min-h-[44px]"
                          aria-label={`Eliminar ${product.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </PermissionGate>
                  </CardContent>
                </Card>
                );
              })}
            </div>

            {totalPages > 1 && (
              <nav
                aria-label="Sectores de productos"
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  className="min-h-[44px] border-slate-300 text-slate-800"
                >
                  <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
                </Button>

                <div className="flex flex-wrap items-center gap-1.5">
                  {pageNumbers.map((entry) =>
                    typeof entry === "number" ? (
                      <button
                        key={entry}
                        type="button"
                        onClick={() => setCurrentPage(entry)}
                        aria-current={safePage === entry ? "page" : undefined}
                        aria-label={`Sector ${entry}`}
                        className={`min-h-[44px] min-w-[44px] rounded-lg border px-3 text-xs font-bold transition-colors ${
                          safePage === entry
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {entry}
                      </button>
                    ) : (
                      <span key={entry} className="px-1.5 text-xs font-bold text-slate-400">
                        …
                      </span>
                    ),
                  )}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  className="min-h-[44px] border-slate-300 text-slate-800"
                >
                  Siguiente <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </nav>
            )}
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
