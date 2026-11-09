export interface ProductImagePlaceholderProps {
  label?: string;
  name?: string;
  category?: string;
  compact?: boolean;
}

export function getProductGlyph(name?: string, category?: string): string {
  const text = `${name || ""} ${category || ""}`.toLowerCase();
  if (
    text.includes("cerveza") ||
    text.includes("águila") ||
    text.includes("aguila") ||
    text.includes("andina") ||
    text.includes("pilsen") ||
    text.includes("corona") ||
    text.includes("beer")
  ) {
    return "🍺";
  }
  if (text.includes("granizado")) return "🍧";
  if (
    text.includes("margarita") ||
    text.includes("vodka") ||
    text.includes("tequila") ||
    text.includes("ron") ||
    text.includes("mojito") ||
    text.includes("coctel") ||
    text.includes("cocktail") ||
    text.includes("baileys") ||
    text.includes("gin")
  ) {
    return "🍸";
  }
  if (
    text.includes("soda") ||
    text.includes("bretaña") ||
    text.includes("coca") ||
    text.includes("gatorade") ||
    text.includes("gaseosa") ||
    text.includes("agua")
  ) {
    return "🥤";
  }
  if (text.includes("malteada") || text.includes("helado")) return "🍦";
  if (text.includes("frappé") || text.includes("frappe") || text.includes("café") || text.includes("cafe")) {
    return "☕";
  }
  if (text.includes("michelada")) return "🍹";
  if (text.includes("jugo") || text.includes("limonada")) return "🍋";
  return "🍹";
}

export default function ProductImagePlaceholder({
  label = "Coctels OPS",
  name,
  category,
  compact = false,
}: ProductImagePlaceholderProps) {
  const glyph = getProductGlyph(name, category);

  if (compact) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 via-black/80 to-accent/20 border border-white/10 rounded-xl">
        <span className="text-2xl filter drop-shadow-[0_0_8px_rgba(233,30,99,0.5)]">{glyph}</span>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-32 w-full flex-col items-center justify-center bg-gradient-to-br from-primary/15 via-black/80 to-accent/15 p-6 text-center relative overflow-hidden group">
      <span className="text-4xl md:text-5xl mb-2 filter drop-shadow-[0_0_12px_rgba(233,30,99,0.6)] transition-transform duration-300 group-hover:scale-110">
        {glyph}
      </span>
      <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/80">
        {label}
      </span>
      <span className="text-[10px] text-muted-foreground/80 tracking-wider capitalize mt-0.5">
        {category || "Bebida de Autor"}
      </span>
    </div>
  );
}
