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
}

export default function ProductCard({ product }: ProductCardProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formattedPrice, setFormattedPrice] = useState<string | null>(null);

  useEffect(() => {
    // Formatear el precio solo en el cliente para evitar errores de hidratación
    setFormattedPrice(product.price.toLocaleString());
  }, [product.price]);

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
            <ProductImagePlaceholder label="Imagen pendiente" />
          )}
          <div className="absolute top-2.5 right-2.5 z-10">
            <Badge variant="secondary" className="bg-black/85 backdrop-blur-md text-primary font-black border border-primary/30 px-2.5 py-1 text-xs shadow-md">
              {formattedPrice ? `$${formattedPrice} COP` : `$${product.price.toLocaleString()} COP`}
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
