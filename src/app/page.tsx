import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CupSoda,
  Flame,
  GlassWater,
  MapPin,
  MessageSquare,
  Sparkles,
  Truck,
  Wine,
} from "lucide-react";

import { PRODUCTS } from "@/app/lib/products";
import HeroShowcase from "@/components/home/HeroShowcase";
import CocktailCarousel from "@/components/products/CocktailCarousel";
import ProductCard from "@/components/products/ProductCard";
import { Button } from "@/components/ui/button";
import { getFeaturedProducts, getHomeCategories } from "@/lib/catalog/home";
import { getStoreConfiguration } from "@/lib/firestore/configuration";
import { buildWhatsAppLink } from "@/lib/orders/whatsapp-message";
import type { Category, Product } from "@/types/catalog";

const STATIC_FALLBACK_CATEGORIES: Category[] = [
  { id: "granizado", name: "Granizados", active: true, order: 1 },
  { id: "cocktail", name: "Cocteles", active: true, order: 2 },
  { id: "special", name: "Especiales", active: true, order: 3 },
];

const HOME_LOCAL_DRINK_PHOTOS: Record<string, string> = {
  "1": "/granizados/Fresa.png",
  "2": "/granizados/Mango.png",
  "3": "/granizados/Coco.png",
  "4": "/granizados/Maracuya.png",
  "5": "/granizados/Lulo.png",
};

function withHomeShowcaseImage(product: Product): Product {
  if (product.image && product.image !== "/catalog-placeholder.svg") {
    return product;
  }
  const localPhoto = HOME_LOCAL_DRINK_PHOTOS[product.id];
  return localPhoto ? { ...product, image: localPhoto } : product;
}

const CATEGORY_VISUALS = [
  {
    subtitle: "8, 16 y 24 oz · Con o sin licor",
    accentBorder: "hover:border-primary/60",
    dotClass: "bg-primary shadow-[0_0_10px_rgba(233,30,99,0.85)]",
    iconClass: "bg-primary/15 text-primary border-primary/30",
    icon: CupSoda,
  },
  {
    subtitle: "Mezclas neón preparadas al instante",
    accentBorder: "hover:border-accent/60",
    dotClass: "bg-accent shadow-[0_0_10px_rgba(0,188,212,0.85)]",
    iconClass: "bg-accent/15 text-accent border-accent/30",
    icon: Wine,
  },
  {
    subtitle: "Cremosos, escarchados y toppings",
    accentBorder: "hover:border-fuchsia-400/60",
    dotClass: "bg-fuchsia-400 shadow-[0_0_10px_rgba(232,121,249,0.85)]",
    iconClass: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-400/30",
    icon: Flame,
  },
  {
    subtitle: "Refrescancia artesanal de la casa",
    accentBorder: "hover:border-amber-400/60",
    dotClass: "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.85)]",
    iconClass: "bg-amber-500/15 text-amber-300 border-amber-400/30",
    icon: GlassWater,
  },
] as const;

const BUILD_STEPS = [
  {
    step: "01",
    title: "Elige tamaño y base",
    description: "Escoge tu presentación exacta (8 oz, 16 oz o 24 oz) y decide si lo quieres con licor o sin licor.",
    accent: "text-primary border-primary/35 bg-primary/10",
  },
  {
    step: "02",
    title: "Combina tu sabor",
    description: "Fresa, mango biche, maracuyá, lulo, coco o cremoso de Baileys preparados al instante.",
    accent: "text-accent border-accent/35 bg-accent/10",
  },
  {
    step: "03",
    title: "Corona con toppings",
    description: "Remata con escarchado cítrico, gomitas, chamoy, fruta picada o leche condensada.",
    accent: "text-[#D98FD6] border-[#8A2BE2]/45 bg-[#8A2BE2]/15",
  },
] as const;

export default async function Home() {
  const [rawFeaturedProducts, categories, configuration] = await Promise.all([
    getFeaturedProducts().catch(() =>
      PRODUCTS.filter((product) => product.active && product.featured).slice(0, 3),
    ),
    getHomeCategories().catch(() => STATIC_FALLBACK_CATEGORIES),
    getStoreConfiguration().catch(() => null),
  ]);
  const featuredProducts = rawFeaturedProducts.map(withHomeShowcaseImage);
  const whatsappHref = configuration ? buildWhatsAppLink(configuration.whatsappNumber) : null;

  return (
    <div className="flex flex-col gap-12 md:gap-20 pb-20 bg-background text-white overflow-x-clip">
      {/* 1. Hero Editorial Asimétrico con Fotografía Real */}
      <section className="relative overflow-hidden border-b border-white/10 bg-black">
        {/* Atmósfera nocturna neón controlada */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-ops-grid opacity-35" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full bg-primary/20 blur-[120px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 right-0 h-[440px] w-[440px] rounded-full bg-accent/15 blur-[130px]"
        />

        <div className="container relative z-10 mx-auto px-4 py-8 sm:py-10 lg:py-14">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
            {/* Columna izquierda: Identidad, propuesta de valor y CTAs */}
            <div className="space-y-6 lg:col-span-7 animate-fade-in text-center lg:text-left">
              {/* Badge oficial con mascota Opsy el Panda */}
              <div className="inline-flex items-center gap-2.5 rounded-full border border-[#8A2BE2]/50 bg-black/80 py-1.5 pl-2 pr-4 text-xs font-semibold text-white shadow-[0_0_20px_rgba(138,43,226,0.3)] backdrop-blur-md">
                <span className="relative h-7 w-7 overflow-hidden rounded-full border border-[#D98FD6]/60 bg-black shrink-0">
                  <Image
                    src="/opsy/opsy-bot.png"
                    alt="Mascota Panda Opsy"
                    fill
                    sizes="28px"
                    className="object-cover"
                    priority
                  />
                </span>
                <span className="text-[#D98FD6] font-bold text-[11px] sm:text-xs tracking-wide">
                  OPSY EL PANDA:{" "}
                  <span className="text-white/95 font-normal">¡Refréscate con los originales!</span>
                </span>
              </div>

              {/* Titular monumental */}
              <div className="space-y-3">
                <p className="text-[11px] sm:text-xs font-black uppercase tracking-[0.3em] text-accent neon-text-cyan">
                  LOS ORIGINALES · MEDELLÍN
                </p>
                <h1 className="font-headline text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-black uppercase leading-[0.95] tracking-tighter text-white">
                  COCTELS{" "}
                  <span className="italic text-primary neon-text-magenta">OPS</span>
                </h1>
                <p className="mx-auto lg:mx-0 max-w-xl text-sm sm:text-base lg:text-lg leading-relaxed text-white/80 font-light">
                  <span className="font-semibold text-white">¡¡ QUE CHIMBA UN OPS !!</span>{" "}
                  Granizados helados, cremosos y cócteles escarchados preparados al instante con fruta natural, licor a tu medida y toppings brutales.
                </p>
              </div>

              {/* Botones de acción principales (>=48px tap target) */}
              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-center lg:justify-start gap-3 pt-1">
                <Button
                  size="lg"
                  className="rounded-full min-h-[48px] h-13 px-8 bg-primary text-white hover:bg-primary/90 neon-shadow-magenta font-black uppercase tracking-widest text-xs sm:text-sm active:scale-95 transition-all"
                  asChild
                >
                  <Link href="/menu">
                    VER EL MENÚ <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>

                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-full min-h-[48px] h-13 px-7 border-[#8A2BE2]/60 bg-[#8A2BE2]/10 text-white hover:bg-[#8A2BE2]/25 hover:border-[#D98FD6] font-bold uppercase tracking-wider text-xs sm:text-sm active:scale-95 transition-all"
                  asChild
                >
                  <Link href="/ai-suggest">
                    <Sparkles className="mr-2 h-4 w-4 text-[#D98FD6]" />
                    PREGÚNTALE A OPSY AI
                  </Link>
                </Button>

                {whatsappHref && (
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-full min-h-[48px] h-13 px-7 border-accent/60 bg-accent/10 text-accent hover:bg-accent/20 font-bold uppercase tracking-wider text-xs sm:text-sm active:scale-95 transition-all"
                    asChild
                  >
                    <Link href={whatsappHref} target="_blank" rel="noopener noreferrer">
                      <MessageSquare className="mr-2 h-4 w-4" />
                      PEDIR POR WHATSAPP
                    </Link>
                  </Button>
                )}
              </div>

              {/* Tira de diferenciales rápidos */}
              <div className="grid grid-cols-3 gap-2.5 pt-2 max-w-lg mx-auto lg:mx-0">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left backdrop-blur-sm">
                  <p className="font-headline text-sm sm:text-base font-black text-white">8 · 16 · 24 oz</p>
                  <p className="text-[11px] text-white/60">Precios reales</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left backdrop-blur-sm">
                  <p className="font-headline text-sm sm:text-base font-black text-accent">Con o sin licor</p>
                  <p className="text-[11px] text-white/60">100% a tu gusto</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left backdrop-blur-sm">
                  <p className="font-headline text-sm sm:text-base font-black text-primary">Villa Hermosa</p>
                  <p className="text-[11px] text-white/60">Domicilios rápidos</p>
                </div>
              </div>
            </div>

            {/* Columna derecha: Showcase interactivo de granizados reales */}
            <div className="lg:col-span-5">
              <HeroShowcase />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Acceso Rápido a Categorías Populares */}
      {categories.length > 0 && (
        <section className="container mx-auto px-4">
          <div className="flex items-end justify-between gap-4 mb-5">
            <div className="space-y-1">
              <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.25em] text-accent">
                Explora por estilo
              </p>
              <h2 className="font-headline text-2xl sm:text-3xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
                CATEGORÍAS POPULARES
              </h2>
            </div>
            <Link
              href="/menu"
              className="inline-flex min-h-[44px] items-center gap-1.5 text-xs sm:text-sm font-bold text-accent hover:text-accent/80 hover:underline shrink-0"
            >
              Ver todas <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {categories.map((category, index) => {
              const visual = CATEGORY_VISUALS[index % CATEGORY_VISUALS.length];
              const Icon = visual.icon;
              return (
                <Link
                  key={category.id}
                  href={`/menu?category=${encodeURIComponent(category.id)}`}
                  className={`group flex min-h-[76px] items-center justify-between gap-4 rounded-2xl border border-white/10 bg-zinc-950/80 p-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/[0.06] active:scale-[0.99] ${visual.accentBorder}`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${visual.iconClass}`}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${visual.dotClass}`} />
                        <span className="truncate font-headline text-base font-bold uppercase tracking-tight text-white group-hover:text-primary transition-colors">
                          {category.name}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-white/60">{visual.subtitle}</p>
                    </div>
                  </div>
                  <ArrowRight
                    className="h-4 w-4 shrink-0 text-white/40 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-white"
                    aria-hidden="true"
                  />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. Favoritos de la Casa ("LOS MÁS TOP") */}
      <section className="container mx-auto px-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-7 gap-4">
          <div className="space-y-1">
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.25em] text-accent">
              Listos para personalizar
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-headline font-black uppercase tracking-tight">
              LOS MÁS <span className="text-primary italic neon-text-magenta">TOP</span>
            </h2>
            <p className="text-xs sm:text-sm text-white/65">
              Mezclas exclusivas de la casa con fruta real y toppings a elección.
            </p>
          </div>
          <Button
            variant="outline"
            className="border-primary/70 text-primary rounded-full hover:bg-primary hover:text-white px-6 min-h-[44px] h-11 uppercase font-black text-xs tracking-wider active:scale-95 transition-all"
            asChild
          >
            <Link href="/menu">
              VER TODO EL MENÚ <ArrowRight className="ml-1.5 w-3.5 h-3.5" />
            </Link>
          </Button>
        </div>

        {featuredProducts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {featuredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-8 text-center">
            <p className="text-sm text-white/75">
              Explora toda nuestra carta interactiva para personalizar tu bebida favorita.
            </p>
            <Button className="mt-4 rounded-full min-h-[44px] bg-primary text-white font-bold uppercase tracking-wider text-xs" asChild>
              <Link href="/menu">Ir al menú completo</Link>
            </Button>
          </div>
        )}
      </section>

      {/* 4. Bento: Arma tu OPS en 3 Pasos + Spotlight de Opsy el Panda AI */}
      <section className="container mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Izquierda: 3 pasos */}
          <div className="lg:col-span-7 rounded-[2rem] border border-white/10 bg-zinc-950/80 p-6 sm:p-8 backdrop-blur-xl flex flex-col justify-between gap-6">
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-accent">
                Experiencia en barra y domicilio
              </p>
              <h2 className="font-headline text-2xl sm:text-4xl font-black uppercase tracking-tight text-white">
                ARMA TU <span className="text-primary italic neon-text-magenta">OPS</span> EN 3 PASOS
              </h2>
              <p className="text-sm text-white/70 max-w-xl">
                Cada copa se prepara al momento exactamente como la pides, con ingredientes frescos y precios transparentes desde el inicio.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {BUILD_STEPS.map((item) => (
                <div
                  key={item.step}
                  className="rounded-2xl border border-white/10 bg-black/70 p-4 flex flex-col gap-3"
                >
                  <span
                    className={`inline-flex h-9 w-11 items-center justify-center rounded-xl border font-headline text-xs font-black tracking-widest ${item.accent}`}
                  >
                    {item.step}
                  </span>
                  <div className="space-y-1">
                    <h3 className="font-headline text-sm font-bold uppercase tracking-tight text-white">
                      {item.title}
                    </h3>
                    <p className="text-xs leading-relaxed text-white/65">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Derecha: Spotlight de Opsy el Panda */}
          <div className="lg:col-span-5 relative overflow-hidden rounded-[2rem] border border-[#8A2BE2]/45 bg-gradient-to-br from-[#8A2BE2]/25 via-zinc-950 to-primary/20 p-6 sm:p-8 flex flex-col justify-between gap-5">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-12 -bottom-12 h-56 w-56 rounded-full bg-[#8A2BE2]/30 blur-3xl"
            />
            <div className="relative z-10 flex items-start justify-between gap-4">
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D98FD6]/40 bg-black/60 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#D98FD6]">
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  Recomendador AI
                </span>
                <h2 className="font-headline text-2xl sm:text-3xl font-black uppercase tracking-tight text-white leading-tight">
                  ¿NO SABES CUÁL PEDIR?
                </h2>
                <p className="text-xs sm:text-sm text-white/80 leading-relaxed">
                  Dile a Opsy si te provoca algo dulce, ácido, cremoso o con licor y te recomienda el granizado ideal en segundos.
                </p>
              </div>
              <div className="relative h-28 w-28 sm:h-32 sm:w-32 shrink-0">
                <Image
                  src="/opsy/opsy-bot.png"
                  alt="Opsy el Panda sosteniendo un granizado OPS"
                  fill
                  sizes="128px"
                  className="object-contain drop-shadow-[0_12px_24px_rgba(138,43,226,0.5)]"
                />
              </div>
            </div>

            <div className="relative z-10">
              <Button
                size="lg"
                className="w-full rounded-full min-h-[48px] bg-white text-black hover:bg-white/90 font-black uppercase tracking-wider text-xs active:scale-95 transition-all"
                asChild
              >
                <Link href="/ai-suggest">
                  DESCUBRIR MI SABOR CON OPSY <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Domicilios, Punto Físico y Carrusel Showcase */}
      <section className="container mx-auto px-4">
        <div className="relative overflow-hidden rounded-[2rem] border border-primary/25 bg-zinc-950/85 p-6 sm:p-8 md:p-12 backdrop-blur-xl">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl"
          />
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 items-center">
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-accent">
                  Entregas en Medellín
                </p>
                <h2 className="text-3xl md:text-5xl font-headline font-black tracking-tighter neon-text-magenta uppercase">
                  DOMICILIOS
                </h2>
                <div className="h-1.5 w-16 rounded-full bg-accent shadow-[0_0_10px_rgba(0,188,212,0.8)]" />
              </div>

              <div className="grid gap-3">
                {whatsappHref && (
                  <Link
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 p-4 md:p-5 min-h-[60px] rounded-2xl bg-black/75 border border-primary/25 group hover:border-primary/65 transition-all active:scale-[0.99]"
                  >
                    <div className="bg-primary/20 p-3 rounded-xl text-primary group-hover:bg-primary group-hover:text-white transition-all shadow-[0_0_15px_rgba(233,30,99,0.3)]">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-accent mb-0.5 font-bold">
                        Pide por WhatsApp
                      </p>
                      <p className="text-lg md:text-xl font-bold text-white tracking-tight">
                        {configuration?.whatsappNumber}
                      </p>
                    </div>
                  </Link>
                )}

                <div className="flex items-center gap-4 p-4 md:p-5 min-h-[60px] rounded-2xl bg-black/75 border border-accent/25">
                  <div className="bg-accent/20 p-3 rounded-xl text-accent shadow-[0_0_15px_rgba(0,188,212,0.3)]">
                    <Truck className="w-6 h-6" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/60 font-bold">
                      También disponibles en
                    </p>
                    <div className="flex gap-3 items-center">
                      <span className="font-black text-sm text-[#FF4D00]">DiDi Food</span>
                      <span className="text-white/25">|</span>
                      <span className="font-black text-sm text-[#FF441F]">Rappi</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 border-l-4 border-accent bg-accent/10 rounded-r-2xl">
                <MapPin className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-sm text-white font-semibold">Carrera 37 # 66 D 36, Villa Hermosa</p>
                  <p className="text-xs text-white/70 italic tracking-wide">
                    &quot;Llegamos frío y potente a todo el barrio.&quot;
                  </p>
                </div>
              </div>
            </div>

            <div className="relative aspect-square rounded-2xl overflow-hidden shadow-2xl border border-white/10 order-first md:order-last min-h-[280px]">
              <CocktailCarousel products={featuredProducts} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
