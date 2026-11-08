"use client";

import { useEffect, useState } from "react";
import { GlassWater, UtensilsCrossed, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export const SERVICE_MESA_STORAGE_KEY = "coctels_ops_service_mesa";
export const SERVICE_TYPE_STORAGE_KEY = "coctels_ops_service_type";

export type TableServiceBannerProps = {
  initialMesa?: string;
};

export default function TableServiceBanner({ initialMesa }: TableServiceBannerProps) {
  const [service, setService] = useState<{
    type: "mesa" | "pickup";
    label: string;
  } | null>(null);

  useEffect(() => {
    let rawMesa = initialMesa?.trim();

    // Si no vino en props, consultar sessionStorage en cliente
    if (!rawMesa && typeof window !== "undefined") {
      const stored = window.sessionStorage.getItem(SERVICE_MESA_STORAGE_KEY);
      if (stored) {
        rawMesa = stored;
      }
    }

    if (rawMesa) {
      const isBarra = rawMesa.toLowerCase() === "barra" || rawMesa.toLowerCase() === "recoger en barra";
      const type: "mesa" | "pickup" = isBarra ? "pickup" : "mesa";
      const label = isBarra
        ? "Recoger en Barra"
        : rawMesa.toLowerCase().startsWith("mesa")
        ? rawMesa
        : `Mesa ${rawMesa}`;

      setService({ type, label });

      try {
        window.sessionStorage.setItem(SERVICE_MESA_STORAGE_KEY, label);
        window.sessionStorage.setItem(SERVICE_TYPE_STORAGE_KEY, type);
      } catch {
        // En navegadores con almacenamiento privado restringido
      }
    }
  }, [initialMesa]);

  const handleClear = () => {
    setService(null);
    try {
      window.sessionStorage.removeItem(SERVICE_MESA_STORAGE_KEY);
      window.sessionStorage.removeItem(SERVICE_TYPE_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  if (!service) return null;

  const isBarra = service.type === "pickup";

  return (
    <div
      role="status"
      aria-label="Información de servicio en local"
      className="max-w-2xl mx-auto rounded-2xl border border-primary/40 bg-gradient-to-r from-card/90 via-primary/10 to-card/90 p-4 md:p-5 backdrop-blur-xl shadow-[0_0_25px_rgba(229,25,110,0.2)] animate-in fade-in slide-in-from-top duration-300"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/20 border border-primary/30 text-primary">
            {isBarra ? (
              <GlassWater className="h-6 w-6 text-cyan-400" />
            ) : (
              <UtensilsCrossed className="h-6 w-6 text-pink-500" />
            )}
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary">
              Consumo en Local
            </div>
            <h2 className="text-sm md:text-base font-extrabold text-white">
              {isBarra ? "🍸 Retiro en Barra Activo" : `🍽️ Servicio en ${service.label}`}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isBarra
                ? "Tus bebidas estarán listas en la barra principal. En checkout ya está configurado."
                : `Llevaremos tus cócteles directamente a tu mesa. En checkout ya está configurado.`}
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleClear}
          className="rounded-full text-muted-foreground hover:text-white shrink-0 min-h-[44px] min-w-[44px]"
          aria-label="Quitar mesa y pedir para domicilio"
          title="Quitar mesa y pedir para domicilio"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
