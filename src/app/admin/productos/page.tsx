"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import Link from "next/link";
import { Plus, Pencil, Trash2, RefreshCw, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import type { Product } from "@/types/catalog";

export default function ProductsPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "outOfStock">("all");

  async function load() {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/productos", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const body = (await response.json().catch(() => ({}))) as { products?: Product[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar los productos.");
      setProducts(body.products ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los productos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [user]);

  async function remove(product: Product) {
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

  async function toggleStock(product: Product) {
    if (!user) return;
    const newStock = product.stock > 0 ? 0 : 10;
    // Actualización optimista
    setProducts((items) =>
      items.map((item) => (item.id === product.id ? { ...item, stock: newStock } : item))
    );

    try {
      const response = await fetch(`/api/admin/productos/${encodeURIComponent(product.id)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
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

  async function toggleActive(product: Product) {
    if (!user) return;
    const newActive = !product.active;
    // Actualización optimista
    setProducts((items) =>
      items.map((item) => (item.id === product.id ? { ...item, active: newActive } : item))
    );

    try {
      const response = await fetch(`/api/admin/productos/${encodeURIComponent(product.id)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ active: newActive }),
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

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.category.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (statusFilter === "active") return product.active;
    if (statusFilter === "outOfStock") return product.stock === 0;
    return true;
  });

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
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="search"
              placeholder="Buscar por nombre o categoría..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-white border-slate-300 text-slate-900 focus:ring-cyan-500 min-h-[44px]"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors min-h-[38px] ${
                statusFilter === "all" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950"
              }`}
            >
              Todos ({products.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("active")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors min-h-[38px] ${
                statusFilter === "active" ? "bg-white text-emerald-800 shadow-sm" : "text-slate-600 hover:text-slate-950"
              }`}
            >
              Activos ({products.filter((p) => p.active).length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("outOfStock")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors min-h-[38px] ${
                statusFilter === "outOfStock" ? "bg-white text-red-800 shadow-sm" : "text-slate-600 hover:text-slate-950"
              }`}
            >
              Agotados ({products.filter((p) => p.stock === 0).length})
            </button>
          </div>
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
          <div className="grid gap-3">
            {filteredProducts.map((product) => (
              <Card key={product.id} className="border-slate-200 bg-white shadow-sm overflow-hidden">
                <CardContent className="flex flex-col gap-4 p-4 sm:p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
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
                      <span className="capitalize font-medium">{product.category}</span> ·{" "}
                      <span className="font-bold text-slate-900">
                        ${product.price.toLocaleString("es-CO")} COP
                      </span>
                      {product.availableSizes && product.availableSizes.length > 0 && (
                        <span className="ml-1.5 text-xs text-slate-500">
                          ({product.availableSizes.length} presentaciones)
                        </span>
                      )}
                    </p>
                    {product.availableFlavors && product.availableFlavors.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        <span className="text-xs text-slate-500 mr-1">Sabores:</span>
                        {product.availableFlavors.map((flavor, fIdx) => (
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

                  <PermissionGate permission="productos.write">
                    <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0">
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
            ))}
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
