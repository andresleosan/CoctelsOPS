"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import ProductImagePlaceholder from "@/components/products/ProductImagePlaceholder";
import type { Product } from "@/types/catalog";

export default function CocktailCarousel({ products }: { products: Product[] }) {
  const slides = products.filter((product) => product.active && product.featured);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (mediaQuery.matches) {
        setIsAutoPlay(false);
      }
    }
  }, []);

  useEffect(() => {
    if (slides.length < 2 || !isAutoPlay) return;
    const timer = setInterval(() => setCurrentIndex((previous) => (previous + 1) % slides.length), 4000);
    return () => clearInterval(timer);
  }, [isAutoPlay, slides.length]);

  useEffect(() => {
    setCurrentIndex((previous) => Math.min(previous, Math.max(slides.length - 1, 0)));
  }, [slides.length]);

  if (slides.length === 0) {
    return <ProductImagePlaceholder label="Catálogo en preparación" />;
  }

  const currentProduct = slides[currentIndex];
  const moveTo = (index: number) => {
    setIsAutoPlay(false);
    setCurrentIndex(index);
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-black/40 backdrop-blur-sm">
      <div className="relative h-full w-full min-h-[260px]">
        {slides.map((product, index) => (
          <div
            key={product.id}
            className={`absolute inset-0 transition-opacity duration-700 ${index === currentIndex ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"}`}
            aria-hidden={index !== currentIndex}
          >
            {product.image ? (
              <Image
                src={product.image}
                alt={product.name}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-contain p-2"
                priority={index === 0}
              />
            ) : (
              <ProductImagePlaceholder label="Imagen pendiente" />
            )}
          </div>
        ))}
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent pointer-events-none z-10" />

      {/* Estado OPS */}
      <div className="absolute bottom-3 left-3 right-3 z-20">
        <div className="flex items-center justify-between rounded-xl border border-primary/40 bg-black/85 p-3 backdrop-blur-xl shadow-lg">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white">ESTADO OPS</span>
          <span className="flex items-center gap-2 text-[10px] font-black uppercase text-green-400">
            <span className="h-2 w-2 animate-ping rounded-full bg-green-400" />
            ABIERTO AHORA
          </span>
        </div>
      </div>

      {slides.length > 1 && (
        <>
          <div className="absolute bottom-16 left-1/2 z-20 flex -translate-x-1/2 gap-2 items-center min-h-[44px]">
            {slides.map((product, index) => (
              <button
                key={product.id}
                type="button"
                onClick={() => moveTo(index)}
                className={`h-2.5 rounded-full transition-all min-h-[44px] flex items-center justify-center p-1 ${
                  index === currentIndex
                    ? "w-8 bg-primary shadow-[0_0_10px_rgba(233,30,99,0.8)]"
                    : "w-2.5 bg-white/40 hover:bg-white/70"
                }`}
                aria-label={`Ir al producto ${index + 1}: ${product.name}`}
              >
                <span className="sr-only">{product.name}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => moveTo((currentIndex - 1 + slides.length) % slides.length)}
            className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/70 hover:bg-primary border border-white/10 hover:border-primary text-white w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center transition-all active:scale-95 shadow-md"
            aria-label="Producto anterior"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => moveTo((currentIndex + 1) % slides.length)}
            className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/70 hover:bg-primary border border-white/10 hover:border-primary text-white w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center transition-all active:scale-95 shadow-md"
            aria-label="Producto siguiente"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}

      {/* Título del producto actual */}
      <div className="absolute left-3 right-3 top-3 z-20">
        <div className="inline-block rounded-lg border border-primary/40 bg-black/85 px-3.5 py-1.5 backdrop-blur-xl shadow-md">
          <p className="text-xs md:text-sm font-black uppercase tracking-wide text-primary neon-text-magenta">
            {currentProduct.name}
          </p>
        </div>
      </div>
    </div>
  );
}
