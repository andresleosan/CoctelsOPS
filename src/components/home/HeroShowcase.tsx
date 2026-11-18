"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Flame, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

type ShowcaseDrink = {
  id: string;
  shortLabel: string;
  name: string;
  badge: string;
  priceLabel: string;
  notes: string;
  image: string;
  haloColor: string;
  ringClass: string;
  accentTextClass: string;
};

const SHOWCASE_DRINKS: ShowcaseDrink[] = [
  {
    id: "fresa-salvaje",
    shortLabel: "Fresa",
    name: "Fresa Salvaje",
    badge: "Top #1 en barra",
    priceLabel: "Desde $10.000 COP",
    notes: "Escarchado neón, pulpa de fresa natural y rodaja de limón.",
    image: "/granizados/Fresa.png",
    haloColor: "rgba(233, 30, 99, 0.42)",
    ringClass: "border-primary/60 shadow-[0_0_24px_rgba(233,30,99,0.35)]",
    accentTextClass: "text-primary",
  },
  {
    id: "mango-biche",
    shortLabel: "Mango",
    name: "Mango Biche Special",
    badge: "Favorito paisa",
    priceLabel: "Desde $10.000 COP",
    notes: "Mango verde ácido con aros de gomita, sal cítrica y limón.",
    image: "/granizados/Mango.png",
    haloColor: "rgba(132, 204, 22, 0.36)",
    ringClass: "border-lime-400/60 shadow-[0_0_24px_rgba(132,204,22,0.3)]",
    accentTextClass: "text-lime-300",
  },
  {
    id: "maracuya-tropical",
    shortLabel: "Maracuyá",
    name: "Explosión de Maracuyá",
    badge: "Receta de autor",
    priceLabel: "Desde $10.000 COP",
    notes: "Fruta de la pasión intensa coronada con brocheta de gomitas.",
    image: "/granizados/Maracuya.png",
    haloColor: "rgba(245, 158, 11, 0.4)",
    ringClass: "border-amber-400/60 shadow-[0_0_24px_rgba(245,158,11,0.3)]",
    accentTextClass: "text-amber-300",
  },
  {
    id: "coco-loco",
    shortLabel: "Coco",
    name: "Coco Loco Tropical",
    badge: "Ultra cremoso",
    priceLabel: "Desde $15.000 COP",
    notes: "Base cremosa escarchada con chamoy y lluvia de gomitas.",
    image: "/granizados/Coco.png",
    haloColor: "rgba(168, 85, 247, 0.4)",
    ringClass: "border-fuchsia-400/60 shadow-[0_0_24px_rgba(168,85,247,0.32)]",
    accentTextClass: "text-fuchsia-300",
  },
  {
    id: "lulo-citrico",
    shortLabel: "Lulo",
    name: "Lulo Refrescante",
    badge: "Cítrico helado",
    priceLabel: "Desde $10.000 COP",
    notes: "Lulo fresco escarchado en sal de limón para refrescar la noche.",
    image: "/granizados/Lulo.png",
    haloColor: "rgba(0, 188, 212, 0.38)",
    ringClass: "border-accent/60 shadow-[0_0_24px_rgba(0,188,212,0.32)]",
    accentTextClass: "text-accent",
  },
];

export default function HeroShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setAutoPlay(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!autoPlay) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % SHOWCASE_DRINKS.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [autoPlay]);

  const current = SHOWCASE_DRINKS[activeIndex];

  const handleSelect = (index: number) => {
    setAutoPlay(false);
    setActiveIndex(index);
  };

  return (
    <div className="relative mx-auto w-full max-w-[440px]">
      {/* Aura neón dinámica sincronizada con el sabor seleccionado */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-4 rounded-[2.5rem] blur-3xl opacity-70 transition-colors duration-700"
        style={{ background: `radial-gradient(circle at 50% 42%, ${current.haloColor}, transparent 72%)` }}
      />

      {/* Marco principal fotográfico */}
      <div className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-zinc-950/90 shadow-2xl shadow-black/80 backdrop-blur-xl">
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-black">
          {SHOWCASE_DRINKS.map((drink, index) => {
            const isCurrent = index === activeIndex;
            return (
              <div
                key={drink.id}
                aria-hidden={!isCurrent}
                className={`absolute inset-0 transition-opacity duration-500 ${
                  isCurrent ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0"
                }`}
              >
                <Image
                  src={drink.image}
                  alt={drink.name}
                  fill
                  priority={index === 0}
                  sizes="(max-width: 768px) 92vw, 440px"
                  className="object-cover object-center"
                />
              </div>
            );
          })}

          {/* Degradado editorial inferior y superior para garantizar legibilidad */}
          <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-t from-black via-black/30 to-black/35" />

          {/* Barra superior sobre la foto: badge de sabor + sello oficial circular */}
          <div className="absolute inset-x-4 top-4 z-30 flex items-start justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/75 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white backdrop-blur-md">
              <Flame className={`h-3.5 w-3.5 ${current.accentTextClass}`} aria-hidden="true" />
              {current.badge}
            </span>

            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-primary/70 bg-black shadow-[0_0_20px_rgba(233,30,99,0.45)]">
              <Image
                src="/brand/coctels-ops-logo.png"
                alt="Sello oficial Coctels OPS"
                fill
                sizes="56px"
                className="object-cover"
                priority
              />
            </div>
          </div>

          {/* Tarjeta inferior flotante con información comercial y CTA directo */}
          <div className="absolute inset-x-4 bottom-4 z-30 rounded-2xl border border-white/15 bg-black/80 p-4 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-[11px] font-bold uppercase tracking-[0.2em] ${current.accentTextClass}`}>
                  {current.priceLabel}
                </p>
                <h2 className="mt-0.5 truncate font-headline text-xl font-black uppercase tracking-tight text-white">
                  {current.name}
                </h2>
              </div>
              <Link
                href="/menu"
                aria-label={`Pedir ${current.name} en el menú`}
                className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl bg-primary px-3 text-xs font-bold uppercase tracking-wider text-white transition-transform hover:bg-primary/90 active:scale-95 neon-shadow-magenta"
              >
                <span className="sr-only sm:not-sr-only sm:mr-1">Pedir</span>
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-white/80">{current.notes}</p>
          </div>
        </div>

        {/* Selector táctil de 5 sabores reales */}
        <div className="border-t border-white/10 bg-black/90 p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-white/60">
              <Sparkles className="h-3 w-3 text-accent" aria-hidden="true" />
              Explora nuestros sabores
            </span>
            <span className="text-[10px] font-semibold text-white/50">
              {activeIndex + 1} / {SHOWCASE_DRINKS.length}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2" role="tablist" aria-label="Sabores destacados de Coctels OPS">
            {SHOWCASE_DRINKS.map((drink, index) => {
              const selected = index === activeIndex;
              return (
                <button
                  key={drink.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-label={`Ver ${drink.name}`}
                  onClick={() => handleSelect(index)}
                  className={`group flex min-h-[56px] flex-col items-center gap-1 rounded-xl border p-1 transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    selected
                      ? `bg-white/10 ${drink.ringClass}`
                      : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.07]"
                  }`}
                >
                  <div className="relative h-9 w-full overflow-hidden rounded-lg bg-black">
                    <Image
                      src={drink.image}
                      alt=""
                      fill
                      sizes="72px"
                      className="object-cover transition-transform duration-300 group-hover:scale-110"
                    />
                  </div>
                  <span
                    className={`truncate text-[10px] font-bold tracking-tight ${
                      selected ? "text-white" : "text-white/65 group-hover:text-white"
                    }`}
                  >
                    {drink.shortLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
