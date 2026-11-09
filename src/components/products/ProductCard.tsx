"use client";

import Image from "next/image";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import type { Product } from "@/types/catalog";
import { useState, useEffect } from "react";
import ProductCustomizer from "./ProductCustomizer";
import { Badge } from "@/components/ui/badge";
import ProductImagePlaceholder from "./ProductImagePlaceholder";

interface ProductCardProps {
  product: Product;
  layout?: "grid" | "list";
}

export default function ProductCard({ product, layout = "grid" }: ProductCardProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formattedPrice, setFormattedPrice] = useState<string | null>(null);

  useEffect(() => {
    // Formatear el precio solo en el cliente para evitar errores de hidratación
    setFormattedPrice(product.price.toLocaleString());
  }, [product.price]);

  const priceLabel = formattedPrice
    ? `$${formattedPrice} COP`
    : `$${product.price.toLocaleString()} COP`;
  const sizePrefix =
    product.availableSizes && product.availableSizes.length > 1 ? "Desde " : "";

  // Modo Lista Compacta (diseño horizontal optimizado para catálogos extensos tipo Mobbin / Uber Eats / Swiggy)
  if (layout === "list") {
    return (
      <>
        <div className="group relative flex flex-row items-center justify-between p-3.5 sm:p-4 rounded-2xl border border-white/10 hover:border-primary/50 bg-black/70 backdrop-blur-md shadow-md hover:shadow-[0_0_20px_rgba(233,30,99,0.2)] transition-all duration-300 gap-3 sm:gap-4">
          {/* Lado izquierdo: Textos, Sabores y Precios */}
          <div className="flex-1 min-w-0 pr-2">
            <div className="flex items-center gap-2">
              <h3 className="font-headline font-bold text-base sm:text-lg text-white group-hover:text-primary transition-colors tracking-tight truncate">
                {product.name}
              </h3>
              {product.featured && (
                <Badge className="bg-primary/20 text-primary border-primary/40 text-[9px] uppercase font-black px-1.5 py-0.5">
                  Popular
                </Badge>
              )}
            </div>

            <p className="text-xs text-muted-foreground line-clamp-1 sm:line-clamp-2 mt-1 leading-relaxed">
              {product.description}
            </p>

            {product.availableFlavors && product.availableFlavors.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2" aria-label="Sabores disponibles">
                {product.availableFlavors.slice(0, 3).map((flavor) => (
                  <span
                    key={flavor}
                    className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-950/40 text-cyan-300 border border-cyan-500/30"
                  >
                    {flavor}
                  </span>
                ))}
                {product.availableFlavors.length > 3 && (
                  <span className="inline-flex items-center text-[10px] text-muted-foreground px-1 self-center">
                    +{product.availableFlavors.length - 3}
                  </span>
                )}
              </div>
            )}

            <div className="mt-2.5 flex items-center gap-2">
              <span className="font-headline font-black text-sm sm:text-base text-primary">
                {sizePrefix}
                {priceLabel}
              </span>
            </div>
          </div>

          {/* Lado derecho: Thumbnail compacto y Botón de Personalización */}
          <div className="flex flex-col sm:flex-row items-center gap-2.5 shrink-0">
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-black/40 border border-white/10 shrink-0">
              {product.image ? (
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  sizes="80px"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  data-ai-hint="refreshing granizado"
                />
              ) : (
                <ProductImagePlaceholder
                  name={product.name}
                  category={product.category}
                  compact
                />
              )}
            </div>

            <Button
              className="min-h-[44px] h-10 px-3.5 sm:px-4 rounded-xl gap-1.5 bg-primary hover:bg-primary/90 text-white font-bold text-xs uppercase tracking-wider neon-shadow-magenta shrink-0 active:scale-95 transition-all"
              onClick={() => setIsDialogOpen(true)}
              aria-label={`Personalizar ${product.name}`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Personalizar</span>
            </Button>
          </div>
        </div>

        <ProductCustomizer
          product={product}
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
        />
      </>
    );
  }

  // Modo Cuadrícula Estándar (Grid)
  return (
    <>
      <Card className="group overflow-hidden rounded-2xl border border-white/10 hover:border-primary/40 bg-black/60 backdrop-blur-md shadow-md hover:shadow-[0_0_25px_rgba(233,30,99,0.25)] transition-all duration-300 flex flex-col justify-between">
        <CardHeader className="p-0 relative aspect-square overflow-hidden bg-black/40">
          {product.image ? (
            <Image
              src={product.image}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              data-ai-hint="refreshing granizado"
            />
          ) : (
            <ProductImagePlaceholder
              label="Coctels OPS"
              name={product.name}
              category={product.category}
            />
          )}
          <div className="absolute top-2.5 right-2.5 z-10">
            <Badge
              variant="secondary"
              className="bg-black/85 backdrop-blur-md text-primary font-black border border-primary/30 px-2.5 py-1 text-xs shadow-md"
            >
              {sizePrefix}
              {priceLabel}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4 flex-grow flex flex-col justify-between">
          <div>
            <h3 className="font-headline font-bold text-lg mb-1.5 group-hover:text-primary transition-colors text-white tracking-tight">
              {product.name}
            </h3>
            <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem] leading-relaxed">
              {product.description}
            </p>
            {product.availableFlavors && product.availableFlavors.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5" aria-label="Sabores disponibles">
                {product.availableFlavors.slice(0, 3).map((flavor) => (
                  <span
                    key={flavor}
                    className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-950/40 text-cyan-300 border border-cyan-500/30 tracking-wide"
                  >
                    {flavor}
                  </span>
                ))}
                {product.availableFlavors.length > 3 && (
                  <span className="inline-flex items-center text-[10px] text-muted-foreground px-1 self-center">
                    +{product.availableFlavors.length - 3} más
                  </span>
                )}
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="p-4 pt-0">
          <Button
            className="w-full min-h-[44px] h-12 gap-2 rounded-full group-hover:translate-y-[-1px] transition-all active:scale-95 bg-primary hover:bg-primary/90 text-white font-bold text-xs uppercase tracking-wider neon-shadow-magenta"
            onClick={() => setIsDialogOpen(true)}
            aria-label={`Personalizar ${product.name}`}
          >
            <Plus className="w-4 h-4" />
            Personalizar
          </Button>
        </CardFooter>
      </Card>

      <ProductCustomizer
        product={product}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </>
  );
}
