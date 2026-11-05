"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { ProductForm } from "@/components/admin/ProductForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import type { Product } from "@/types/catalog";

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [product, setProduct] = useState<Product>();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    void user
      .getIdToken()
      .then((token) =>
        fetch(`/api/admin/productos/${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      )
      .then(async (response) => {
        const body = (await response.json()) as { product?: Product; error?: string };
        if (!response.ok) throw new Error(body.error ?? "No se pudo cargar el producto.");
        setProduct(body.product);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el producto."));
  }, [id, user]);

  return (
    <AdminGuard permission="productos.write">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="min-h-[44px] text-slate-600 hover:text-slate-900">
            <Link href="/admin/productos">
              <ArrowLeft className="h-4 w-4 mr-1" /> Volver al catálogo
            </Link>
          </Button>
        </div>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-slate-950">
              {product ? `Editar ${product.name}` : "Editar Producto"}
            </CardTitle>
            <CardDescription className="text-slate-600">
              Modifica precios, presentaciones, disponibilidad de stock o sabores en tiempo real.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
                {error}
              </p>
            ) : product ? (
              <ProductForm product={product} />
            ) : (
              <div className="h-48 animate-pulse rounded-lg bg-slate-100" />
            )}
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  );
}
