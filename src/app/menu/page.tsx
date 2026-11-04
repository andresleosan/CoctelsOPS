import { listActiveProducts } from "@/lib/firestore/products";
import { listCategories } from "@/lib/firestore/categories";
import ProductCatalogBrowser from "@/components/products/ProductCatalogBrowser";
import { Button } from "@/components/ui/button";
import { ExternalLink, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  const [products, categories] = await Promise.all([listActiveProducts(), listCategories()]);

  return (
    <div className="container mx-auto px-4 py-8 md:py-12 space-y-8 md:space-y-12">
      {/* Header del Menú Mobile-First */}
      <div className="text-center space-y-3 max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold tracking-widest uppercase">
          <Sparkles className="w-3.5 h-3.5" />
          Carta Oficial 2025/2026
        </div>
        <h1 className="text-3xl md:text-5xl font-headline font-black text-white tracking-tight uppercase">
          NUESTRO <span className="text-primary italic neon-text-magenta">MENÚ</span>
        </h1>
        <p className="text-xs md:text-base text-muted-foreground leading-relaxed px-4">
          Bebidas artesanales preparadas con fruta fresca, bases premium y el toque inconfundible de Coctels OPS en Medellín.
        </p>
      </div>

      {/* Banner Menú Oficial Canva (Compacto, Glassmorphism Nocturno) */}
      <div className="max-w-2xl mx-auto">
        <div className="relative overflow-hidden rounded-2xl md:rounded-3xl border border-primary/30 bg-gradient-to-r from-black/80 via-black/60 to-black/80 p-5 md:p-6 backdrop-blur-xl shadow-[0_0_30px_rgba(233,30,99,0.15)] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left space-y-1">
            <h2 className="text-base md:text-lg font-headline font-bold text-white flex items-center justify-center sm:justify-start gap-2">
              <span>📖</span> Carta Completa en Canva
            </h2>
            <p className="text-xs text-muted-foreground">
              Consulta fotos y presentaciones de toda nuestra carta comercial interactiva.
            </p>
          </div>
          <Button
            asChild
            size="sm"
            className="rounded-full bg-primary hover:bg-primary/90 text-white font-bold min-h-[44px] px-6 text-xs uppercase tracking-wider neon-shadow-magenta shrink-0 active:scale-95 transition-all"
          >
            <a
              href="https://cartacoctelsops.my.canva.site/?fbclid=PAY2xjawIBM0BleHRuA2FlbQIxMAABpo07SqMFni5aqLVnII7WNFsKVhxq3eOu2xY8bP-DEYY-UbmWzsnyb0pfyw_aem_9w328MMocFp3VHv0IGkJaA"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir Menú Oficial en Canva"
            >
              Abrir Canva <ExternalLink className="ml-1.5 w-3.5 h-3.5" />
            </a>
          </Button>
        </div>
      </div>

      {/* Navegador y Menú Continuo con Sticky Category Bar */}
      <ProductCatalogBrowser products={products} categories={categories} />
    </div>
  );
}
