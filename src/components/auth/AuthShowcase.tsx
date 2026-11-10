"use client";

import Image from "next/image";
import { useState } from "react";
import { Sparkles, Star } from "lucide-react";

const GRANIZADOS = [
  {
    id: "fresa",
    name: "Fresa Salvaje",
    tagline: "El clásico más pedido",
    tag: "Top #1 Ventas",
    image: "/granizados/Fresa.png",
    accent: "from-pink-500/20 via-rose-500/10 to-transparent",
    glow: "rgba(244, 63, 94, 0.35)",
    notes: "Fresa natural, gomitas artesanales y leche condensada cremosa.",
  },
  {
    id: "mango",
    name: "Mango Biche Special",
    tagline: "Ácido, dulce y refrescante",
    tag: "Favorito Tarde",
    image: "/granizados/Mango.png",
    accent: "from-amber-500/20 via-yellow-500/10 to-transparent",
    glow: "rgba(245, 158, 11, 0.35)",
    notes: "Mango verde triturado, sal, limón y sirope de chamoy.",
  },
  {
    id: "maracuya",
    name: "Maracuyá Tropical",
    tagline: "Intensidad exótica",
    tag: "Receta de Autor",
    image: "/granizados/Maracuya.png",
    accent: "from-orange-500/20 via-amber-500/10 to-transparent",
    glow: "rgba(249, 115, 22, 0.35)",
    notes: "Pulpa pura de maracuyá con base cítrica y escarchado dulce.",
  },
];

export default function AuthShowcase() {
  const [selected, setSelected] = useState(0);
  const current = GRANIZADOS[selected];

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-card/80 via-card/50 to-background/90 p-6 md:p-8 backdrop-blur-xl shadow-2xl flex flex-col justify-between h-full min-h-[520px]">
      {/* Resplandor ambiental de fondo */}
      <div
        className="pointer-events-none absolute -top-24 -left-24 h-80 w-80 rounded-full blur-3xl transition-all duration-700 opacity-60"
        style={{ background: current.glow }}
      />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />

      {/* Header del showcase */}
      <div className="relative z-10 space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary backdrop-blur-md">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Coctels OPS · Medellín</span>
        </div>
        <h2 className="font-headline text-2xl md:text-3xl font-extrabold tracking-tight text-white leading-snug">
          El sabor auténtico de la noche paisa en cada copa.
        </h2>
        <p className="text-xs md:text-sm text-slate-300 leading-relaxed max-w-md">
          Granizados y cócteles artesanales preparados al instante con fruta 100% natural, recetas de autor y bases premium.
        </p>
      </div>

      {/* Imagen destacada del producto */}
      <div className="relative z-10 my-4 flex flex-col items-center justify-center">
        <div className="relative h-64 w-64 md:h-72 md:w-72 transition-transform duration-500 hover:scale-105">
          {/* Sombra y glow debajo del vaso */}
          <div
            className="absolute inset-x-8 bottom-2 h-10 rounded-full blur-xl transition-colors duration-500"
            style={{ background: current.glow }}
          />
          <Image
            src={current.image}
            alt={current.name}
            fill
            sizes="(max-width: 768px) 256px, 288px"
            className="object-contain drop-shadow-[0_20px_35px_rgba(0,0,0,0.65)]"
            priority
          />
        </div>

        {/* Badge flotante del producto activo */}
        <div className="mt-2 text-center space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/60 px-3 py-1 backdrop-blur-md">
            <span className="text-[11px] font-bold text-primary uppercase tracking-wider">
              {current.tag}
            </span>
            <span className="text-white/40">·</span>
            <span className="text-xs font-semibold text-white">{current.name}</span>
          </div>
          <p className="text-[11px] text-slate-400 italic">{current.notes}</p>
        </div>

        {/* Selector interactivo de granizados */}
        <div className="mt-4 flex gap-2">
          {GRANIZADOS.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(idx)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                selected === idx
                  ? "bg-primary text-white shadow-md shadow-primary/30 ring-1 ring-primary/50"
                  : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              {item.name.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Footer / Social proof */}
      <div className="relative z-10 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-1.5 text-amber-400">
          <Star className="h-4 w-4 fill-amber-400" />
          <span className="font-bold text-white">4.9 / 5.0</span>
          <span className="text-slate-400">(+1,200 pedidos en Medellín)</span>
        </div>
        <span className="text-[11px] text-slate-500 font-medium">Bases premium · Fruta real</span>
      </div>
    </div>
  );
}
