import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Truck, MessageSquare, MapPin, Sparkles } from "lucide-react";
import ProductCard from "@/components/products/ProductCard";
import CocktailCarousel from "@/components/products/CocktailCarousel";
import { getFeaturedProducts, getHomeCategories } from "@/lib/catalog/home";
import { getStoreConfiguration } from "@/lib/firestore/configuration";
import { buildWhatsAppLink } from "@/lib/orders/whatsapp-message";
import { PlaceHolderImages } from "@/lib/placeholder-images";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [featuredProducts, categories, configuration] = await Promise.all([
    getFeaturedProducts(),
    getHomeCategories(),
    getStoreConfiguration().catch(() => null),
  ]);
  const whatsappHref = configuration ? buildWhatsAppLink(configuration.whatsappNumber) : null;

  const heroImage = PlaceHolderImages.find((img) => img.id === "hero-granizado")?.imageUrl || "/catalog-placeholder.svg";
  const logoImage = PlaceHolderImages.find((img) => img.id === "logo-ops")?.imageUrl || "/catalog-placeholder.svg";

  return (
    <div className="flex flex-col gap-10 md:gap-16 pb-20 bg-background text-white">
      {/* Hero Section Mobile-First (~65vh en móvil) */}
      <section className="relative min-h-[60vh] sm:min-h-[65vh] md:min-h-[75vh] flex items-center justify-center overflow-hidden py-6 md:py-12">
        <div className="absolute inset-0 z-0">
          <Image
            src={heroImage}
            alt="Ambiente nocturno OPS"
            fill
            sizes="100vw"
            className="object-cover opacity-25 grayscale-[0.2]"
            priority
            data-ai-hint="neon cocktail"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/80 to-background" />
        </div>

        <div className="container mx-auto px-4 relative z-10 text-center space-y-4 md:space-y-6 animate-fade-in flex flex-col items-center justify-center min-h-full">
          {/* Logo compacto y optimizado */}
          <div className="flex justify-center w-full">
            <div className="relative w-28 h-28 sm:w-36 sm:h-36 md:w-56 md:h-56 rounded-full border-4 border-primary p-1 shadow-[0_0_35px_rgba(233,30,99,0.5)] bg-black overflow-hidden group transition-all flex items-center justify-center">
              <Image
                src={logoImage}
                alt="COCTELS OPS OFICIAL"
                fill
                sizes="(max-width: 640px) 112px, (max-width: 768px) 144px, 224px"
                className="object-cover object-center transition-transform duration-700 group-hover:scale-105"
                priority
                data-ai-hint="neon logo"
              />
            </div>
          </div>

          {/* Mascota Oficial Opsy el Panda */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/70 border border-[#8A2BE2]/50 text-white text-xs font-semibold shadow-[0_0_15px_rgba(138,43,226,0.35)] backdrop-blur-md">
            <span className="text-sm md:text-base" role="img" aria-label="Mascota Panda Opsy">🐼</span>
            <span className="text-[#D98FD6] font-bold text-[11px] md:text-xs tracking-wide">
              OPSY EL PANDA: <span className="text-white/90 font-normal">¡Refréscate con los originales!</span>
            </span>
          </div>

          {/* Títulos y Claim de Marca */}
          <div className="space-y-2">
            <p className="text-accent font-black tracking-[0.3em] uppercase text-[10px] md:text-xs neon-text-cyan">
              LOS ORIGINALES
            </p>
            <h1 className="text-4xl sm:text-6xl md:text-8xl font-headline font-bold leading-tight tracking-tighter uppercase">
              COCTELS <span className="text-primary italic neon-text-magenta">OPS</span>
            </h1>
            <p className="text-xs sm:text-sm md:text-lg text-white/80 max-w-lg mx-auto font-light tracking-wide px-2 leading-relaxed">
              ¡¡ QUE CHIMBA UN OPS !! <br className="hidden sm:inline" />
              La experiencia refrescante más potente de Medellín.
            </p>
          </div>

          {/* Botones de Acción (Tap Targets >= 44px) */}
          <div className="flex flex-col sm:flex-row justify-center gap-3 pt-1 px-4 w-full sm:w-auto">
            <Button
              size="lg"
              className="rounded-full min-h-[48px] h-12 md:h-14 px-8 bg-primary text-white hover:bg-primary/90 neon-shadow-magenta font-black uppercase tracking-widest text-xs md:text-sm active:scale-95 transition-all"
              asChild
            >
              <Link href="/menu">
                VER EL MENÚ <ArrowRight className="ml-1.5 w-4 h-4" />
              </Link>
            </Button>
            {whatsappHref && (
              <Button
                size="lg"
                variant="outline"
                className="rounded-full min-h-[48px] h-12 md:h-14 px-8 border-accent text-accent hover:bg-accent/10 font-bold uppercase tracking-widest text-xs md:text-sm active:scale-95 transition-all"
                asChild
              >
                <Link href={whatsappHref} target="_blank" rel="noopener noreferrer">
                  <MessageSquare className="mr-2 w-4 h-4" /> PEDIR POR WHATSAPP
                </Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Acceso Rápido a Categorías en el Primer Scroll */}
      {categories.length > 0 && (
        <section className="container mx-auto px-4 -mt-4 md:-mt-6 relative z-20">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-xs md:text-sm font-bold uppercase tracking-widest text-white/90 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-accent animate-pulse" />
              CATEGORÍAS POPULARES
            </h2>
            <Link
              href="/menu"
              className="text-[11px] font-bold text-accent hover:text-accent/80 hover:underline flex items-center gap-1 min-h-[44px]"
            >
              Ver todas <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-none snap-x -mx-4 px-4 sm:mx-0 sm:px-0">
            {categories.map((category) => (
              <Link
                key={category.id}
                href="/menu"
                className="snap-start shrink-0 flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-full bg-card/60 border border-primary/20 hover:border-primary/60 hover:bg-primary/10 active:scale-95 transition-all text-xs font-bold text-white shadow-sm backdrop-blur-md"
              >
                <span className="w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_rgba(0,188,212,0.8)]" />
                <span>{category.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Domicilios Info & Showcase */}
      <section className="container mx-auto px-4">
        <div className="bg-card/40 border border-primary/20 rounded-[2rem] p-6 md:p-12 backdrop-blur-xl relative overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div className="space-y-6">
              <div className="space-y-1">
                <h2 className="text-3xl md:text-5xl font-headline font-bold tracking-tighter neon-text-magenta uppercase">
                  DOMICILIOS
                </h2>
                <div className="h-1.5 w-16 bg-accent shadow-[0_0_10px_rgba(0,188,212,0.8)]" />
              </div>

              <div className="grid gap-3">
                {whatsappHref && (
                  <Link
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 p-4 md:p-5 min-h-[56px] rounded-2xl bg-black/60 border border-primary/20 group hover:border-primary/60 transition-all active:scale-95"
                  >
                    <div className="bg-primary/20 p-3 rounded-xl text-primary group-hover:bg-primary group-hover:text-white transition-all shadow-[0_0_15px_rgba(233,30,99,0.3)]">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.2em] text-accent mb-0.5 font-bold">
                        Pide por WhatsApp
                      </p>
                      <p className="text-lg md:text-xl font-bold text-white tracking-tight">
                        {configuration?.whatsappNumber}
                      </p>
                    </div>
                  </Link>
                )}

                <div className="flex items-center gap-4 p-4 md:p-5 min-h-[56px] rounded-2xl bg-black/60 border border-accent/20">
                  <div className="bg-accent/20 p-3 rounded-xl text-accent shadow-[0_0_15px_rgba(0,188,212,0.3)]">
                    <Truck className="w-6 h-6" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground font-bold">También en</p>
                    <div className="flex gap-3 items-center">
                      <span className="font-black text-xs text-[#FF4D00]">DiDi Food</span>
                      <span className="text-white/20">|</span>
                      <span className="font-black text-xs text-[#FF441F]">Rappi</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 border-l-4 border-accent bg-accent/5 rounded-r-2xl">
                <MapPin className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-xs text-white font-medium">Carrera 37 # 66 D 36, Villa Hermosa</p>
                  <p className="text-[10px] text-muted-foreground italic tracking-wide">
                    &quot;Llegamos frío y potente a todo el barrio.&quot;
                  </p>
                </div>
              </div>
            </div>

            <div className="relative aspect-square rounded-2xl overflow-hidden shadow-2xl border border-white/5 order-first md:order-last min-h-[260px]">
              <CocktailCarousel products={featuredProducts} />
            </div>
          </div>
        </div>
      </section>

      {/* Featured Products ("LOS MÁS TOP") */}
      <section className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 md:mb-8 gap-3">
          <div className="space-y-0.5">
            <h2 className="text-3xl md:text-5xl font-headline font-bold uppercase tracking-tight">
              LOS MÁS <span className="text-primary italic neon-text-magenta">TOP</span>
            </h2>
            <p className="text-muted-foreground tracking-[0.2em] uppercase text-[9px] md:text-xs">
              Mezclas exclusivas de la casa
            </p>
          </div>
          <Button
            variant="outline"
            className="border-primary text-primary rounded-full hover:bg-primary/10 px-6 min-h-[44px] h-11 uppercase font-black text-xs active:scale-95 transition-all"
            asChild
          >
            <Link href="/menu">
              VER TODO EL MENÚ <ArrowRight className="ml-1.5 w-3.5 h-3.5" />
            </Link>
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {featuredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </div>
  );
}
