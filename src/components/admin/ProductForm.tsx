"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Camera, Plus, RefreshCw, Trash2, X } from "lucide-react";

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

const DEFAULT_PLACEHOLDER = "/catalog-placeholder.svg";

const emptyProduct: ProductInput = {
  name: "",
  description: "",
  price: 0,
  image: DEFAULT_PLACEHOLDER,
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
  const [imagePreview, setImagePreview] = useState(product?.image ?? DEFAULT_PLACEHOLDER);
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

  function handleFileSelected(selectedFile: File | null): void {
    if (!selectedFile) return;

    if (selectedFile.size > 5 * 1024 * 1024) {
      setError("La imagen supera el límite de 5 MB. Elige una imagen más liviana.");
      return;
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(selectedFile.type)) {
      setError("Solo se aceptan imágenes en formato JPEG, PNG o WebP.");
      return;
    }

    setError("");
    setImageFile(selectedFile);
    setImagePreview(URL.createObjectURL(selectedFile));
  }

  function selectImage(event: React.ChangeEvent<HTMLInputElement>): void {
    const selectedFile = event.target.files?.[0] ?? null;
    handleFileSelected(selectedFile);
  }

  function resetToPlaceholder(): void {
    setImageFile(null);
    setImagePreview(DEFAULT_PLACEHOLDER);
    setForm((prev) => ({ ...prev, image: DEFAULT_PLACEHOLDER }));
    setError("");
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
    const resolvedImage = form.image.trim() || DEFAULT_PLACEHOLDER;

    const input: ProductInput = {
      ...form,
      image: resolvedImage,
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
        if (!imageResponse.ok) throw new Error(imageBody.error ?? "No se pudo subir la fotografía.");
      } else if (product && resolvedImage === DEFAULT_PLACEHOLDER && product.image !== DEFAULT_PLACEHOLDER) {
        // Si el staff quitó la imagen y restableció el placeholder, ejecutar DELETE
        await fetch(`/api/admin/productos/${encodeURIComponent(product.id)}/image`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        });
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
              className="bg-white border-slate-300 text-slate-900 focus:ring-cyan-500 min-h-[90px]"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-category" className="text-slate-800 font-medium">Categoría</Label>
            <select
              id="product-category"
              className="w-full h-10 px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value as ProductInput["category"] })}
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
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
              required
            />
          </div>
        </div>
      </div>

      {/* 2. Presentaciones y Tamaños */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">Presentaciones y Tamaños Reales</h3>
            <p className="text-xs text-slate-500">
              Define los tamaños exactos de la carta (ej. 8 oz, 16 oz, 24 oz) y su precio en COP.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addSize}
            className="border-cyan-600 text-cyan-700 hover:bg-cyan-50 font-medium min-h-[44px]"
          >
            <Plus className="h-4 w-4 mr-1 text-cyan-600" /> Agregar tamaño
          </Button>
        </div>

        {sizes.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-2">
            No has agregado presentaciones individuales. Se utilizará únicamente el precio base del producto.
          </p>
        ) : (
          <div className="space-y-3">
            {sizes.map((size, index) => (
              <div
                key={index}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/50"
              >
                <div className="flex-1">
                  <Label htmlFor={`size-name-${index}`} className="text-xs text-slate-600">
                    Nombre de Presentación
                  </Label>
                  <Input
                    id={`size-name-${index}`}
                    placeholder="Ej. 8 oz, 16 oz, 24 oz, Copa, Jarra"
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
                    placeholder="10000"
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

      {/* 3. Gestión de Sabores Disponibles */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">Sabores Disponibles</h3>
          <p className="text-xs text-slate-500">
            Añade los sabores que el cliente puede elegir. Apaga o elimina un sabor cuando se agote la pulpa.
          </p>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Ej. Maracuyá, Fresa, Mango Biche, Frutos Rojos"
            value={newFlavorInput}
            onChange={(e) => setNewFlavorInput(e.target.value)}
            onKeyDown={handleFlavorKeyDown}
            className="bg-white border-slate-300 text-slate-900"
          />
          <Button
            type="button"
            onClick={addFlavor}
            className="bg-cyan-600 hover:bg-cyan-700 text-white min-h-[44px] shrink-0"
          >
            <Plus className="h-4 w-4 mr-1" /> Agregar sabor
          </Button>
        </div>

        {flavors.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-1">
            No has agregado sabores para este producto (el cliente no verá opciones de sabor).
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 pt-2">
            {flavors.map((flavor, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-cyan-50 border border-cyan-200 text-cyan-900 shadow-xs"
              >
                <span>{flavor}</span>
                <button
                  type="button"
                  onClick={() => removeFlavor(index)}
                  className="rounded-full p-0.5 text-cyan-700 hover:bg-cyan-200 hover:text-cyan-950 transition-colors"
                  aria-label={`Eliminar sabor ${flavor}`}
                >
                  <X className="h-3.5 w-3.5" />
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
              Personalizaciones opcionales con su costo extra en pesos colombianos.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addAddOn}
            className="border-cyan-600 text-cyan-700 hover:bg-cyan-50 font-medium min-h-[44px]"
          >
            <Plus className="h-4 w-4 mr-1 text-cyan-600" /> Agregar adición
          </Button>
        </div>

        {addOns.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-2">
            No hay adiciones configuradas para este producto.
          </p>
        ) : (
          <div className="space-y-3">
            {addOns.map((addOn, index) => (
              <div
                key={index}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/50"
              >
                <div className="flex-1">
                  <Label htmlFor={`addon-name-${index}`} className="text-xs text-slate-600">
                    Nombre del Topping o Adición
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Fotografía del Producto
            </h3>
            <p className="text-xs text-slate-500">
              Toma una foto desde la barra o selecciona una imagen de tu galería para Cloudflare R2.
            </p>
          </div>
          {imagePreview === DEFAULT_PLACEHOLDER ? (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              Placeholder oficial
            </span>
          ) : imageFile ? (
            <span className="rounded-full bg-cyan-100 px-2.5 py-0.5 text-xs font-semibold text-cyan-800">
              Nueva foto lista
            </span>
          ) : (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
              Foto en Cloudflare R2
            </span>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Controles de Carga */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="product-image-file" className="text-slate-800 font-medium">
                {product ? "Reemplazar imagen" : "Seleccionar imagen"}
              </Label>
              <Input
                id="product-image-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={selectImage}
                className="bg-white border-slate-300 text-slate-900"
              />
              <p className="text-xs text-slate-500">
                JPEG, PNG o WebP de máximo 5 MB.
              </p>
            </div>

            {/* Accesos rápidos táctiles móvil (Cámara y Reset a Placeholder) */}
            <div className="flex flex-wrap gap-2 pt-1">
              <input
                id="mobile-camera-capture"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={selectImage}
                className="sr-only"
                aria-label="Tomar foto con cámara"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById("mobile-camera-capture")?.click()}
                className="flex-1 min-h-[44px] border-cyan-500/30 text-cyan-700 hover:bg-cyan-50 font-medium gap-2 text-xs sm:text-sm"
              >
                <Camera className="h-4 w-4 text-cyan-600" />
                <span>Tomar foto con cámara</span>
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={resetToPlaceholder}
                className="min-h-[44px] text-slate-600 hover:text-slate-900 hover:bg-slate-100 gap-1.5 text-xs sm:text-sm"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Usar placeholder</span>
              </Button>
            </div>

            {/* Opciones avanzadas: URL manual */}
            <details className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
              <summary className="cursor-pointer font-medium text-slate-700 hover:text-slate-900">
                Opciones avanzadas: URL manual de imagen
              </summary>
              <div className="mt-3 space-y-2">
                <Label htmlFor="product-image" className="text-xs font-semibold text-slate-700">
                  URL de Imagen (Host Permitido)
                </Label>
                <Input
                  id="product-image"
                  type="url"
                  className="bg-white border-slate-300 text-slate-900 text-xs focus:ring-cyan-500"
                  value={form.image}
                  onChange={(event) => {
                    const val = event.target.value;
                    setForm({ ...form, image: val });
                    if (val.trim()) setImagePreview(val);
                  }}
                  placeholder="https://... o /catalog-placeholder.svg"
                />
                <p className="text-[11px] text-slate-500">
                  Usa una URL permitida (Firebase Storage o Cloudflare R2).
                </p>
              </div>
            </details>
          </div>

          {/* Vista previa en vivo */}
          <div className="space-y-2">
            <Label className="text-slate-800 font-medium">Vista previa en vivo</Label>
            <div className="relative aspect-video overflow-hidden rounded-xl border border-slate-200 bg-slate-950 flex items-center justify-center shadow-inner">
              <span className="sr-only">
                {`Vista previa de ${product?.name || form.name || "producto"}`}
              </span>
              {imagePreview ? (
                <Image
                  src={imagePreview}
                  alt={`Vista previa de ${product?.name || form.name || "producto"}`}
                  fill
                  unoptimized
                  className="object-contain"
                />
              ) : (
                <p className="text-xs text-slate-400">Sin imagen seleccionada</p>
              )}
            </div>
          </div>
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
