"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { categoryInputSchema } from "@/lib/validation/catalog";
import type { Category, CategoryInput } from "@/types/catalog";

export function CategoryForm({ category }: { category?: Category }) {
  const { user } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState<CategoryInput>(
    category ? { ...category } : { name: "", active: true, order: 0 },
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const parsed = categoryInputSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa los datos.");
      return;
    }
    if (!user) return;
    setSaving(true);
    try {
      const response = await fetch(
        category
          ? `/api/admin/categorias/${encodeURIComponent(category.id)}`
          : "/api/admin/categorias",
        {
          method: category ? "PATCH" : "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${await user.getIdToken()}`,
          },
          body: JSON.stringify(parsed.data),
        },
      );
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "No se pudo guardar la categoría.");
      router.push("/admin/categorias");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar la categoría.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-xl space-y-5 text-slate-900">
      <div className="space-y-2">
        <Label htmlFor="category-name" className="text-slate-800">
          Nombre
        </Label>
        <Input
          id="category-name"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          className="min-h-[44px] border-slate-300 bg-white text-slate-900"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="category-order" className="text-slate-800">
          Orden
        </Label>
        <Input
          id="category-order"
          type="number"
          min="0"
          value={form.order}
          onChange={(event) => setForm({ ...form, order: Number(event.target.value) })}
          className="min-h-[44px] border-slate-300 bg-white text-slate-900"
        />
      </div>
      <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(event) => setForm({ ...form, active: event.target.checked })}
          className="h-4 w-4 rounded border-slate-300"
        />{" "}
        Categoría activa
      </label>
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={saving} className="min-h-[44px]">
          {saving ? "Guardando..." : "Guardar categoría"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          className="min-h-[44px] border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
