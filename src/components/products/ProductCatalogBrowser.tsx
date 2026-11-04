"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Filter, Search, X } from "lucide-react";

import type { Category, Product } from "@/types/catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import ProductCard from "@/components/products/ProductCard";

export type ProductCatalogBrowserProps = {
  products: Product[];
  categories: Category[];
};

export const CATEGORY_ICON_MAP: Record<string, string> = {
  granizado: "🍧",
  cocktail: "🍸",
  soda: "🥤",
  sodas: "🥤",
  malteada: "🍦",
  malteadas: "🍦",
  special: "✨",
};

export function getCategoryIcon(id: string, name: string): string {
  const lower = `${id} ${name}`.toLowerCase();
  if (lower.includes("granizado")) return CATEGORY_ICON_MAP.granizado;
  if (lower.includes("coctel") || lower.includes("cocktail")) return CATEGORY_ICON_MAP.cocktail;
  if (lower.includes("soda")) return CATEGORY_ICON_MAP.soda;
  if (lower.includes("malteada")) return CATEGORY_ICON_MAP.malteada;
  if (lower.includes("especial") || lower.includes("special")) return CATEGORY_ICON_MAP.special;
  return "🍹";
}

export default function ProductCatalogBrowser({ products, categories }: ProductCatalogBrowserProps) {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [, startTransition] = useTransition();

  const isProgrammaticScroll = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  // Ordenar categorías según su orden configurado y agregar categorías adicionales de los productos
  const allCategories = useMemo(() => {
    const sorted = [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const categoryIds = new Set(sorted.map((c) => c.id));
    const extra: Category[] = [];

    products.forEach((p) => {
      if (p.category && !categoryIds.has(p.category)) {
        categoryIds.add(p.category);
        extra.push({
          id: p.category,
          name: p.category.charAt(0).toUpperCase() + p.category.slice(1),
          active: true,
          order: 99,
        });
      }
    });

    return [...sorted, ...extra];
  }, [categories, products]);

  // Filtrar productos reactivamente por término de búsqueda (nombre, descripción o sabores)
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredProducts = products.filter((product) => {
    if (!normalizedQuery) return true;
    const matchesName = product.name.toLowerCase().includes(normalizedQuery);
    const matchesDesc = product.description.toLowerCase().includes(normalizedQuery);
    const matchesFlavor = product.availableFlavors?.some((flavor) =>
      flavor.toLowerCase().includes(normalizedQuery)
    );
    return matchesName || matchesDesc || matchesFlavor;
  });

  // Agrupar productos filtrados por categoría
  const productsByCategory = allCategories
    .map((category) => {
      const categoryProducts = filteredProducts.filter((p) => p.category === category.id);
      return {
        category,
        products: categoryProducts,
      };
    })
    .filter((group) => group.products.length > 0);

  // Scroll Espía Bidireccional (IntersectionObserver)
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (isProgrammaticScroll.current) return;

        const visibleEntry = entries.find((entry) => entry.isIntersecting);
        if (visibleEntry) {
          const categoryId = visibleEntry.target.getAttribute("data-category-id");
          if (categoryId) {
            setActiveCategory(categoryId);
          }
        }
      },
      {
        rootMargin: "-120px 0px -60% 0px",
        threshold: 0.1,
      }
    );

    const sectionElements = document.querySelectorAll("[data-category-section]");
    sectionElements.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
    };
  }, [allCategories, products, searchQuery]);

  // Centrar el botón activo en la barra de categorías horizontal
  useEffect(() => {
    if (activeCategory && tabsContainerRef.current) {
      const activeBtn = tabsContainerRef.current.querySelector(
        `[data-category-tab="${activeCategory}"]`
      );
      if (activeBtn && typeof activeBtn.scrollIntoView === "function") {
        activeBtn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }
  }, [activeCategory]);

  const handleCategoryClick = (categoryId: string) => {
    startTransition(() => {
      setActiveCategory(categoryId);
    });

    isProgrammaticScroll.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      isProgrammaticScroll.current = false;
    }, 800);

    if (categoryId === "all") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const sectionElement = document.getElementById(`category-section-${categoryId}`);
    if (sectionElement) {
      sectionElement.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleClearSearch = () => {
    setSearchQuery("");
  };

  return (
    <div className="w-full space-y-6">
      {/* Buscador Reactivo Mobile-First con 1-tap clear */}
      <div className="relative max-w-xl mx-auto">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Buscar por sabor, fruta o nombre..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Buscar bebidas en el menú"
          className="pl-12 pr-12 h-13 rounded-full bg-card/60 border-white/15 text-white placeholder:text-muted-foreground/80 focus:border-primary focus:ring-primary/20 backdrop-blur-md text-sm md:text-base shadow-lg"
        />
        {searchQuery.length > 0 && (
          <button
            type="button"
            onClick={handleClearSearch}
            aria-label="Limpiar búsqueda"
            className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-white transition-colors rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Indicador de resultados activos cuando se busca */}
      {searchQuery.trim().length > 0 && (
        <div className="flex items-center justify-between px-2 text-xs md:text-sm text-muted-foreground">
          <span>
            Mostrando <strong className="text-white font-bold">{filteredProducts.length}</strong> {filteredProducts.length === 1 ? "resultado" : "resultados"} para &ldquo;<span className="text-primary">{searchQuery}</span>&rdquo;
          </span>
          <button
            type="button"
            onClick={handleClearSearch}
            className="text-primary hover:underline font-semibold min-h-[44px] inline-flex items-center"
          >
            Ver toda la carta
          </button>
        </div>
      )}

      {/* Sticky Category Bar con Glow Neón y Scroll Espía (Shake Shack / Blank Street pattern) */}
      <nav
        aria-label="Categorías del menú"
        className="sticky top-16 z-30 -mx-4 px-4 sm:mx-0 sm:px-0 py-3 bg-background/90 backdrop-blur-xl border-b border-white/10 shadow-xl transition-all"
      >
        <div
          ref={tabsContainerRef}
          role="tablist"
          className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth py-1"
        >
          <Button
            key="all"
            role="tab"
            data-category-tab="all"
            aria-selected={activeCategory === "all"}
            aria-label="Ver todas las categorías"
            variant={activeCategory === "all" ? "default" : "outline"}
            onClick={() => handleCategoryClick("all")}
            className={`min-h-[44px] px-5 rounded-full shrink-0 font-bold text-xs uppercase tracking-wider transition-all duration-300 ${
              activeCategory === "all"
                ? "bg-primary text-white neon-shadow-magenta border-primary scale-[1.02]"
                : "bg-card/70 border-white/15 text-white/80 hover:text-white hover:bg-card/90"
            }`}
          >
            ✨ Todos
          </Button>

          {allCategories.map((category) => {
            const isActive = activeCategory === category.id;
            const icon = getCategoryIcon(category.id, category.name);
            return (
              <Button
                key={category.id}
                role="tab"
                data-category-tab={category.id}
                aria-selected={isActive}
                aria-label={`Ver categoría ${category.name}`}
                variant={isActive ? "default" : "outline"}
                onClick={() => handleCategoryClick(category.id)}
                className={`min-h-[44px] px-5 rounded-full shrink-0 font-bold text-xs uppercase tracking-wider transition-all duration-300 ${
                  isActive
                    ? "bg-primary text-white neon-shadow-magenta border-primary scale-[1.02]"
                    : "bg-card/70 border-white/15 text-white/80 hover:text-white hover:bg-card/90"
                }`}
              >
                <span className="mr-1.5 text-sm" role="img" aria-hidden="true">
                  {icon}
                </span>
                {category.name}
              </Button>
            );
          })}
        </div>
      </nav>

      {/* Menú Continuo Agrupado por Secciones de Categoría con Anclas */}
      {productsByCategory.length > 0 ? (
        <div className="space-y-14 pt-4">
          {productsByCategory.map(({ category, products: catProducts }) => (
            <section
              key={category.id}
              id={`category-section-${category.id}`}
              data-category-id={category.id}
              data-category-section
              className="scroll-mt-36 space-y-6"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <span className="text-2xl" role="img" aria-hidden="true">
                    {getCategoryIcon(category.id, category.name)}
                  </span>
                  <div>
                    <h2 className="text-xl md:text-2xl font-headline font-bold uppercase tracking-tight text-white">
                      {category.name}
                    </h2>
                    <div className="h-0.5 w-12 bg-primary rounded-full mt-1 neon-shadow-magenta" />
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className="bg-card/60 text-muted-foreground border-white/10 text-xs px-3 py-1 font-semibold"
                >
                  {catProducts.length} {catProducts.length === 1 ? "bebida" : "bebidas"}
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {catProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        /* Estado vacío con feedback amigable y 1-tap reset */
        <div className="text-center py-20 px-4 space-y-5 bg-card/30 border border-white/10 rounded-3xl backdrop-blur-md max-w-lg mx-auto">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Filter className="w-8 h-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-headline font-bold text-white">No encontramos lo que buscas</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              No hay bebidas que coincidan con &ldquo;<span className="text-white">{searchQuery}</span>&rdquo;. Prueba buscando por otro sabor (ej. Fresa, Mango, Maracuyá).
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleClearSearch}
            aria-label="Restablecer búsqueda"
            className="min-h-[44px] rounded-full border-primary/30 text-white hover:bg-primary/20 font-bold px-6 active:scale-95 transition-all"
          >
            Restablecer búsqueda
          </Button>
        </div>
      )}
    </div>
  );
}
