"use client";

import Image from "next/image";
import { Flame, Sparkles, Star } from "lucide-react";
import { useEffect, useState } from "react";

type ShowcaseFlavor = {
  id: string;
  shortLabel: string;
  name: string;
  tag: string;
  priceLabel: string;
  image: string;
  glow: string;
  ringClass: string;
  accentTextClass: string;
  notes: string;
};

const GRANIZADOS: ShowcaseFlavor[] = [
  {
    id: "fresa",
    shortLabel: "Fresa",
    name: "Fresa Salvaje",
    tag: "Top #1 Ventas",
    priceLabel: "Desde $10.000 COP",
    image: "/granizados/Fresa.png",
    glow: "rgba(233, 30, 99, 0.36)",
    ringClass: "border-primary/60 shadow-[0_0_20px_rgba(233,30,99,0.35)]",
    accentTextClass: "text-primary",
    notes: "Fresa natural, gomitas artesanales y leche condensada cremosa.",
  },
  {
    id: "mango",
    shortLabel: "Mango",
    name: "Mango Biche Special",
    tag: "Favorito Paisa",
    priceLabel: "Desde $10.000 COP",
    image: "/granizados/Mango.png",
    glow: "rgba(132, 204, 22, 0.32)",
    ringClass: "border-lime-400/60 shadow-[0_0_20px_rgba(132,204,22,0.3)]",
    accentTextClass: "text-lime-300",
    notes: "Mango verde ácido con aros de gomita, sal cítrica y limón.",
  },
  {
    id: "maracuya",
    shortLabel: "Maracuyá",
    name: "Explosión de Maracuyá",
    tag: "Receta de Autor",
    priceLabel: "Desde $10.000 COP",
    image: "/granizados/Maracuya.png",
    glow: "rgba(245, 158, 11, 0.34)",
    ringClass: "border-amber-400/60 shadow-[0_0_20px_rgba(245,158,11,0.3)]",
    accentTextClass: "text-amber-300",
    notes: "Pulpa pura de maracuyá con base cítrica y escarchado dulce.",
  },
  {
    id: "coco",
    shortLabel: "Coco",
    name: "Coco Loco Tropical",
    tag: "Ultra Cremoso",
    priceLabel: "Desde $15.000 COP",
    image: "/granizados/Coco.png",
    glow: "rgba(168, 85, 247, 0.36)",
    ringClass: "border-fuchsia-400/60 shadow-[0_0_20px_rgba(168,85,247,0.32)]",
    accentTextClass: "text-fuchsia-300",
    notes: "Base cremosa escarchada con chamoy y lluvia de gomitas.",
  },
  {
    id: "lulo",
    shortLabel: "Lulo",
    name: "Lulo Refrescante",
    tag: "Cítrico Helado",
    priceLabel: "Desde $10.000 COP",
    image: "/granizados/Lulo.png",
    glow: "rgba(0, 188, 212, 0.34)",
    ringClass: "border-cyan-400/60 shadow-[0_0_20px_rgba(0,188,212,0.32)]",
    accentTextClass: "text-cyan-300",
    notes: "Lulo fresco escarchado en sal de limón para refrescar la noche.",
  },
];

export default function AuthShowcase() {
  const [selected, setSelected] = useState(0);
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
      setSelected((prev) => (prev + 1) % GRANIZADOS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [autoPlay]);

  const current = GRANIZADOS[selected];

  const handleSelect = (index: number) => {
    setAutoPlay(false);
    setSelected(index);
  };

  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border border-white/15 bg-zinc-950/90 p-6 shadow-2xl shadow-black/80 backdrop-blur-xl xl:p-7">
      {/* Halo radial ambiental sincronizado con el sabor activo */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-24 h-80 w-80 rounded-full blur-3xl opacity-60 transition-colors duration-700"
        style={{ background: current.glow }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl"
      />

      {/* Cabecera en una sola fila + Titular editorial */}
      <div className="relative z-10 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/35 bg-primary/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
            <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full border border-primary/60 bg-black">
              <Image
                src="/brand/coctels-ops-logo.png"
                alt="Sello oficial Coctels OPS"
                fill
                sizes="20px"
                className="object-cover"
              />
            </span>
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span>Coctels OPS · Medellín</span>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-black/60 px-3 py-1 text-xs text-white/90 backdrop-blur-md">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
            <span className="font-bold text-white">4.9</span>
            <span className="text-white/60">· +1.200 pedidos</span>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="font-headline text-2xl font-black leading-[1.12] tracking-tight text-white xl:text-3xl">
            El sabor auténtico de la noche paisa en cada copa.
          </h2>
          <p className="max-w-lg text-sm leading-relaxed text-white/75">
            Granizados y cócteles artesanales preparados al instante con fruta 100% natural, recetas de autor y bases premium.
          </p>
        </div>
      </div>

      {/* Marco fotográfico editorial sin cortes duros */}
      <div className="relative z-10 my-5">
        <div className="relative aspect-[16/11] w-full overflow-hidden rounded-2xl border border-white/15 bg-black shadow-2xl">
          {GRANIZADOS.map((item, idx) => {
            const isCurrent = idx === selected;
            return (
              <div
                key={item.id}
                aria-hidden={!isCurrent}
                className={`absolute inset-0 transition-opacity duration-500 ${
                  isCurrent ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0"
                }`}
              >
                <Image
                  src={item.image}
                  alt={item.name}
                  fill
                  priority={idx === 0}
                  sizes="(max-width: 1280px) 46vw, 520px"
                  className="object-cover object-center"
                />
              </div>
            );
          })}

          <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-t from-black/90 via-black/30 to-black/15" />

          {/* Badge superior */}
          <div className="absolute inset-x-4 top-4 z-30 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/75 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white backdrop-blur-md">
              <Flame className={`h-3.5 w-3.5 ${current.accentTextClass}`} aria-hidden="true" />
              {current.tag}
            </span>
            <span className="rounded-full border border-white/15 bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white/90 backdrop-blur-md">
              {selected + 1} / {GRANIZADOS.length}
            </span>
          </div>

          {/* Pie editorial sobre la foto */}
          <div className="absolute inset-x-4 bottom-4 z-30 space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-headline text-xl font-black uppercase tracking-tight text-white">
                {current.name}
              </h3>
              <span className={`text-xs font-bold uppercase tracking-wider ${current.accentTextClass}`}>
                {current.priceLabel}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-white/85">{current.notes}</p>
          </div>
        </div>
      </div>

      {/* Selector táctil de 5 sabores reales */}
      <div className="relative z-10 space-y-2.5 border-t border-white/10 pt-4">
        <div
          className="grid grid-cols-5 gap-2"
          role="tablist"
          aria-label="Sabores destacados de Coctels OPS"
        >
          {GRANIZADOS.map((item, idx) => {
            const isSelected = selected === idx;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-label={`Ver ${item.name}`}
                onClick={() => handleSelect(idx)}
                className={`group flex min-h-[56px] flex-col items-center gap-1 rounded-xl border p-1 transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  isSelected
                    ? `bg-white/10 ${item.ringClass}`
                    : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.08]"
                }`}
              >
                <div className="relative h-8 w-full overflow-hidden rounded-lg bg-black">
                  <Image
                    src={item.image}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover transition-transform duration-300 group-hover:scale-110"
                  />
                </div>
                <span
                  className={`truncate text-[10px] font-bold tracking-tight ${
                    isSelected ? "text-white" : "text-white/70 group-hover:text-white"
                  }`}
                >
                  {item.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
