"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { CategoryForm } from "@/components/admin/CategoryForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import type { Category } from "@/types/catalog";

export default function EditCategoryPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [category, setCategory] = useState<Category>();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    void user
      .getIdToken()
      .then((token) =>
        fetch("/api/admin/categorias", { headers: { Authorization: `Bearer ${token}` } }),
      )
      .then(async (response) => {
        const body = (await response.json()) as { categories?: Category[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "No se pudo cargar la categoría.");
        setCategory(body.categories?.find((item) => item.id === id));
      })
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la categoría."),
      );
  }, [id, user]);

  return (
    <AdminGuard permission="categorias.write">
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="min-h-[44px] text-slate-700 hover:text-slate-950">
          <Link href="/admin/categorias">
            <ArrowLeft className="h-4 w-4" /> Volver a categorías
          </Link>
        </Button>
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-slate-950">Editar categoría</CardTitle>
          </CardHeader>
          <CardContent>
            {error ? (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            ) : category ? (
              <CategoryForm category={category} />
            ) : (
              <div className="h-32 animate-pulse rounded-lg bg-slate-100" />
            )}
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  );
}
