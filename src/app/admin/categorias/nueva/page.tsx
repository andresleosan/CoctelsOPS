"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { CategoryForm } from "@/components/admin/CategoryForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewCategoryPage() {
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
            <CardTitle className="text-slate-950">Nueva categoría</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryForm />
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  );
}
