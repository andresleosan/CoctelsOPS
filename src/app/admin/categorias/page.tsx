"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import Link from "next/link";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import type { Category } from "@/types/catalog";

export default function CategoriesPage() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/categorias", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const body = (await response.json().catch(() => ({}))) as {
        categories?: Category[];
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar las categorías.");
      setCategories(body.categories ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "No se pudieron cargar las categorías.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [user]);

  async function remove(category: Category) {
    if (!user || !window.confirm(`¿Eliminar la categoría ${category.name}?`)) return;
    const response = await fetch(`/api/admin/categorias/${encodeURIComponent(category.id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "No se pudo eliminar la categoría.");
      return;
    }
    setCategories((items) => items.filter((item) => item.id !== category.id));
  }

  return (
    <AdminGuard permission="categorias.read">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">Catálogo</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">Categorías</h1>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => void load()}
              disabled={loading}
              className="min-h-[44px] border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
            </Button>
            <PermissionGate permission="categorias.write">
              <Button asChild className="min-h-[44px]">
                <Link href="/admin/categorias/nueva">
                  <Plus className="h-4 w-4" /> Nueva categoría
                </Link>
              </Button>
            </PermissionGate>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </p>
        )}

        {loading ? (
          <div className="h-40 animate-pulse rounded-xl bg-white" />
        ) : categories.length === 0 ? (
          <Card className="border-dashed border-slate-300 bg-white">
            <CardContent className="p-10 text-center text-sm text-slate-600">
              No hay categorías registradas.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {categories.map((category) => (
              <Card key={category.id} className="border-slate-200 bg-white shadow-sm">
                <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-semibold text-slate-900">{category.name}</h2>
                    <p className="mt-1 text-sm text-slate-500">Orden {category.order}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={category.active ? "default" : "secondary"}
                      className={
                        category.active
                          ? "bg-emerald-600 text-white hover:bg-emerald-600"
                          : "bg-slate-200 text-slate-700"
                      }
                    >
                      {category.active ? "Activa" : "Inactiva"}
                    </Badge>
                    <PermissionGate permission="categorias.write">
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="min-h-[44px] border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                      >
                        <Link href={`/admin/categorias/${category.id}`}>
                          <Pencil className="h-4 w-4" /> Editar
                        </Link>
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => void remove(category)}
                        className="min-h-[44px]"
                      >
                        <Trash2 className="h-4 w-4" /> Eliminar
                      </Button>
                    </PermissionGate>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
