"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { ProductForm } from "@/components/admin/ProductForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewProductPage() {
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
            <CardTitle className="text-2xl font-bold text-slate-950">Crear Nuevo Producto</CardTitle>
            <CardDescription className="text-slate-600">
              Registra un cóctel, granizado o bebida con sus presentaciones y sabores para la carta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProductForm />
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  );
}
