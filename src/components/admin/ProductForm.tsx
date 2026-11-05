"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { productInputSchema } from "@/lib/validation/catalog";
import type { Category, Product, ProductAddOn, ProductInput, ProductSize } from "@/types/catalog";

const DEFAULT_CATEGORIES = [
  { id: "granizado", name: "Granizado" },
  { id: "cocktail", name: "Cóctel" },
  { id: "special", name: "Especial" },
];

const emptyProduct: ProductInput = {
  name: "",
  description: "",
  price: 0,
  image: "",
  category: "granizado",
  availableSizes: [],
  availableFlavors: [],
  availableAddOns: [],
  stock: 0,
  active: true,
  featured: false,
};

export function ProductForm({ product }: { product?: Product }) {
  const { user } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState<ProductInput>(product ? { ...product } : emptyProduct);
  const [sizes, setSizes] = useState<ProductSize[]>(product?.availableSizes ?? []);
  const [flavors, setFlavors] = useState<string[]>(product?.availableFlavors ?? []);
  const [newFlavorInput, setNewFlavorInput] = useState("");
  const [addOns, setAddOns] = useState<ProductAddOn[]>(product?.availableAddOns ?? []);

  const [categories, setCategories] = useState<{ id: string; name: string }[]>(DEFAULT_CATEGORIES);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState(product?.image ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Load dynamic categories
  useEffect(() => {
    let isMounted = true;
    async function loadCategories() {
      if (!user) return;
      try {
        const response = await fetch("/api/admin/categorias", {
          headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        });
        if (!response.ok) return;
        const data = (await response.json()) as { categories?: Category[] };
        if (isMounted && data.categories && data.categories.length > 0) {
          setCategories(data.categories.map((cat) => ({ id: cat.id, name: cat.name })));
        }
      } catch {
        // Fallback to default categories on failure
      }
    }
    void loadCategories();
    return () => {
      isMounted = false;
    };
  }, [user]);

  // Clean up object URLs
  useEffect(() => () => {
    if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  function selectImage(event: React.ChangeEvent<HTMLInputElement>): void {
    const selectedFile = event.target.files?.[0] ?? null;
    setImageFile(selectedFile);
    setImagePreview(selectedFile ? URL.createObjectURL(selectedFile) : product?.image ?? "");
  }

  // Flavors management
  function addFlavor() {
    const trimmed = newFlavorInput.trim();
    if (!trimmed) return;
    if (flavors.some((f) => f.toLowerCase() === trimmed.toLowerCase())) {
      setError(`El sabor "${trimmed}" ya está en la lista.`);
      return;
    }
    setFlavors([...flavors, trimmed]);
    setNewFlavorInput("");
    setError("");
  }

  function removeFlavor(indexToRemove: number) {
    setFlavors(flavors.filter((_, idx) => idx !== indexToRemove));
  }

  function handleFlavorKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      addFlavor();
    }
  }

  // Sizes management
  function addSize() {
    setSizes([...sizes, { name: "", price: form.price > 0 ? form.price : 10000 }]);
  }

  function updateSize(index: number, field: "name" | "price", value: string | number) {
    const updated = [...sizes];
    if (field === "price") {
      updated[index] = { ...updated[index]!, price: Math.max(0, Number(value)) };
    } else {
      updated[index] = { ...updated[index]!, name: String(value) };
    }
    setSizes(updated);
  }

  function removeSize(index: number) {
    setSizes(sizes.filter((_, idx) => idx !== index));
  }

  // Add-ons management
  function addAddOn() {
    setAddOns([...addOns, { name: "", price: 2000 }]);
  }

  function updateAddOn(index: number, field: "name" | "price", value: string | number) {
    const updated = [...addOns];
    if (field === "price") {
      updated[index] = { ...updated[index]!, price: Math.max(0, Number(value)) };
    } else {
      updated[index] = { ...updated[index]!, name: String(value) };
    }
    setAddOns(updated);
  }

  function removeAddOn(index: number) {
    setAddOns(addOns.filter((_, idx) => idx !== index));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const filteredSizes = sizes.filter((s) => s.name.trim() !== "");
    const filteredAddOns = addOns.filter((a) => a.name.trim() !== "");

    const input: ProductInput = {
      ...form,
      price: Number(form.price),
      stock: Number(form.stock),
      availableSizes: filteredSizes.length > 0 ? filteredSizes : undefined,
      availableFlavors: flavors,
      availableAddOns: filteredAddOns,
    };

    const parsed = productInputSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa los datos del producto.");
      return;
    }

    if (!user || saving) return;
    setSaving(true);

    try {
      const response = await fetch(
        product ? `/api/admin/productos/${encodeURIComponent(product.id)}` : "/api/admin/productos",
        {
          method: product ? "PATCH" : "POST",
          headers: { "content-type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
          body: JSON.stringify(parsed.data),
        }
      );
      const body = (await response.json().catch(() => ({}))) as { error?: string; id?: string; product?: Product };
      if (!response.ok) throw new Error(body.error ?? "No se pudo guardar el producto.");

      const targetId = product?.id ?? body.id;
      if (targetId && imageFile) {
        const imageData = new FormData();
        imageData.append("image", imageFile);
        const imageResponse = await fetch(`/api/admin/productos/${encodeURIComponent(targetId)}/image`, {
          method: "POST",
          headers: { Authorization: `Bearer ${await user.getIdToken()}` },
          body: imageData,
        });
        const imageBody = (await imageResponse.json().catch(() => ({}))) as { error?: string };
        if (!imageResponse.ok) throw new Error(imageBody.error ?? "No se pudo reemplazar la imagen.");
      }

      router.push("/admin/productos");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el producto.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* 1. Información General */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
          Información Básica
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="product-name" className="text-slate-800 font-medium">Nombre</Label>
            <Input
              id="product-name"
              className="bg-white border-slate-300 text-slate-900 focus:ring-cyan-500"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-price" className="text-slate-800 font-medium">
              Precio Base (COP)
            </Label>
            <div className="relative">
              <Input
                id="product-price"
                type="number"
                min="1"
                className="bg-white border-slate-300 text-slate-900 pr-16 focus:ring-cyan-500"
                value={form.price}
                onChange={(event) => setForm({ ...form, price: Number(event.target.value) })}
                required
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-slate-500">
                COP
              </span>
            </div>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="product-description" className="text-slate-800 font-medium">Descripción</Label>
            <Textarea
              id="product-description"
              className="bg-white border-slate-300 text-slate-900 focus:ring-cyan-500"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-category" className="text-slate-800 font-medium">Categoría</Label>
            <select
              id="product-category"
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value as ProductInput["category"] })}
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id} className="text-slate-900">
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-stock" className="text-slate-800 font-medium">Stock Inicial</Label>
            <Input
              id="product-stock"
              type="number"
              min="0"
              className="bg-white border-slate-300 text-slate-900 focus:ring-cyan-500"
              value={form.stock}
              onChange={(event) => setForm({ ...form, stock: Number(event.target.value) })}
            />
          </div>
        </div>
      </div>

      {/* 2. Presentaciones y Tamaños Reales (Carta Canva) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">Presentaciones y Tamaños (Carta Canva)</h3>
            <p className="text-xs text-slate-500">
              Define los tamaños con sus precios reales en COP (ej. 8 oz $10.000, 16 oz $15.000, 24 oz $25.000).
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addSize}
            className="border-cyan-600 text-cyan-700 hover:bg-cyan-50 min-h-[44px]"
          >
            <Plus className="mr-1 h-4 w-4" /> Agregar tamaño
          </Button>
        </div>

        {sizes.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-2">
            Sin tamaños específicos (se aplicará únicamente el precio base).
          </p>
        ) : (
          <div className="space-y-3">
            {sizes.map((size, index) => (
              <div
                key={index}
                className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3 sm:flex-row sm:items-center"
              >
                <div className="flex-1">
                  <Label htmlFor={`size-name-${index}`} className="text-xs text-slate-600">
                    Nombre del tamaño (ej. 16 oz)
                  </Label>
                  <Input
                    id={`size-name-${index}`}
                    placeholder="Ej. 16 oz, 24 oz"
                    value={size.name}
                    onChange={(e) => updateSize(index, "name", e.target.value)}
                    className="bg-white border-slate-300 text-slate-900 mt-1"
                    required
                  />
                </div>
                <div className="w-full sm:w-44">
                  <Label htmlFor={`size-price-${index}`} className="text-xs text-slate-600">
                    Precio en COP
                  </Label>
                  <Input
                    id={`size-price-${index}`}
                    type="number"
                    min="1"
                    placeholder="15000"
                    value={size.price}
                    onChange={(e) => updateSize(index, "price", e.target.value)}
                    className="bg-white border-slate-300 text-slate-900 mt-1"
                    required
                  />
                </div>
                <div className="flex sm:self-end pt-2 sm:pt-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSize(index)}
                    aria-label={`Eliminar tamaño ${size.name || index + 1}`}
                    className="text-red-600 hover:bg-red-50 hover:text-red-700 min-h-[44px] min-w-[44px]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Sabores con Chips Interactivos */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="border-b border-slate-100 pb-2">
          <h3 className="text-base font-bold text-slate-900">Sabores y Pulpas</h3>
          <p className="text-xs text-slate-500">
            Añade sabores disponibles para este cóctel o granizado. El staff puede removerlos con un tap si se agota una fruta.
          </p>
        </div>

        <div className="flex gap-2">
          <Input
            id="new-flavor-input"
            placeholder="Ej. Maracuyá, Fresa, Mango Biche, Coco..."
            value={newFlavorInput}
            onChange={(e) => setNewFlavorInput(e.target.value)}
            onKeyDown={handleFlavorKeyDown}
            className="bg-white border-slate-300 text-slate-900 focus:ring-cyan-500"
          />
          <Button
            type="button"
            onClick={addFlavor}
            className="bg-cyan-600 hover:bg-cyan-700 text-white min-h-[44px] px-4 font-semibold"
          >
            <Plus className="mr-1 h-4 w-4" /> Agregar sabor
          </Button>
        </div>

        {flavors.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-1">No hay sabores configurados aún.</p>
        ) : (
          <div className="flex flex-wrap gap-2 pt-1">
            {flavors.map((flavor, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 border border-cyan-300 px-3.5 py-1.5 text-xs font-semibold text-cyan-900 shadow-sm"
              >
                {flavor}
                <button
                  type="button"
                  onClick={() => removeFlavor(index)}
                  aria-label={`Eliminar sabor ${flavor}`}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-cyan-200 text-cyan-800 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 4. Adiciones y Toppings */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">Adiciones y Toppings</h3>
            <p className="text-xs text-slate-500">
              Personalizaciones con su valor individual real (ej. Gomitas $2.000, Lecherita $1.500, Chamoy $1.000).
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addAddOn}
            className="border-cyan-600 text-cyan-700 hover:bg-cyan-50 min-h-[44px]"
          >
            <Plus className="mr-1 h-4 w-4" /> Agregar adición
          </Button>
        </div>

        {addOns.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-2">Sin adiciones configuradas.</p>
        ) : (
          <div className="space-y-3">
            {addOns.map((addOn, index) => (
              <div
                key={index}
                className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3 sm:flex-row sm:items-center"
              >
                <div className="flex-1">
                  <Label htmlFor={`addon-name-${index}`} className="text-xs text-slate-600">
                    Nombre del topping (ej. Gomitas Trululu)
                  </Label>
                  <Input
                    id={`addon-name-${index}`}
                    placeholder="Ej. Gomitas, Chamoy, Tajín"
                    value={addOn.name}
                    onChange={(e) => updateAddOn(index, "name", e.target.value)}
                    className="bg-white border-slate-300 text-slate-900 mt-1"
                    required
                  />
                </div>
                <div className="w-full sm:w-44">
                  <Label htmlFor={`addon-price-${index}`} className="text-xs text-slate-600">
                    Precio en COP
                  </Label>
                  <Input
                    id={`addon-price-${index}`}
                    type="number"
                    min="1"
                    placeholder="2000"
                    value={addOn.price}
                    onChange={(e) => updateAddOn(index, "price", e.target.value)}
                    className="bg-white border-slate-300 text-slate-900 mt-1"
                    required
                  />
                </div>
                <div className="flex sm:self-end pt-2 sm:pt-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeAddOn(index)}
                    aria-label={`Eliminar adición ${addOn.name || index + 1}`}
                    className="text-red-600 hover:bg-red-50 hover:text-red-700 min-h-[44px] min-w-[44px]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Fotografía del Producto */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
          Fotografía del Producto
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="product-image" className="text-slate-800 font-medium">
              URL de Imagen (Host Permitido)
            </Label>
            <Input
              id="product-image"
              type="url"
              className="bg-white border-slate-300 text-slate-900 focus:ring-cyan-500"
              value={form.image}
              onChange={(event) => setForm({ ...form, image: event.target.value })}
              required={!product}
            />
            <p className="text-xs text-slate-500">
              Usa una URL permitida (Firebase Storage o Cloudflare R2).
            </p>
          </div>

          {product && (
            <div className="space-y-2">
              <Label htmlFor="product-image-file" className="text-slate-800 font-medium">
                Reemplazar imagen
              </Label>
              <Input
                id="product-image-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={selectImage}
                className="bg-white border-slate-300 text-slate-900"
              />
              <p className="text-xs text-slate-500">JPEG, PNG o WebP de máximo 5 MB.</p>
              <div className="relative aspect-video overflow-hidden rounded-lg border border-primary/20 bg-black/40">
                <span className="sr-only">Vista previa de {product.name}</span>
                {imagePreview ? (
                  <Image
                    src={imagePreview}
                    alt={`Vista previa de ${product.name}`}
                    fill
                    unoptimized
                    className="object-contain"
                  />
                ) : (
                  <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    Sin imagen
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 6. Disponibilidad y Estado */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
        <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
          Estado y Visibilidad
        </h3>
        <div className="flex flex-wrap gap-6 text-sm font-medium text-slate-800">
          <label htmlFor="product-active" className="flex items-center gap-3 cursor-pointer min-h-[44px]">
            <input
              id="product-active"
              type="checkbox"
              className="h-5 w-5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
              checked={form.active}
              onChange={(event) => setForm({ ...form, active: event.target.checked })}
            />
            <span>Producto Activo (Visible en tienda)</span>
          </label>

          <label htmlFor="product-featured" className="flex items-center gap-3 cursor-pointer min-h-[44px]">
            <input
              id="product-featured"
              type="checkbox"
              className="h-5 w-5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
              checked={form.featured}
              onChange={(event) => setForm({ ...form, featured: event.target.checked })}
            />
            <span>Destacado (Aparece en carrusel de inicio)</span>
          </label>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3 pt-2">
        <Button
          type="submit"
          disabled={saving}
          className="bg-cyan-600 hover:bg-cyan-700 text-white min-h-[48px] px-6 text-base font-semibold shadow-sm"
        >
          {saving ? "Guardando..." : "Guardar producto"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          className="border-slate-300 text-slate-700 hover:bg-slate-100 min-h-[48px] px-6"
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
