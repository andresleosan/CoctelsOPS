"use client";

import { CalendarClock, Clock, PauseCircle } from "lucide-react";

import {
  evaluateStoreAvailability,
  formatScheduledForLabel,
  type StoreScheduleConfig,
} from "@/lib/orders/store-schedule";

export type StoreAvailabilityBannerProps = {
  configuration?: StoreScheduleConfig | null;
  storeName?: string;
  className?: string;
};

export function StoreAvailabilityBanner({
  configuration,
  storeName = "Coctels OPS",
  className = "",
}: StoreAvailabilityBannerProps) {
  const availability = evaluateStoreAvailability(configuration);

  if (availability.status === "paused") {
    const resumeLabel = availability.pauseResumeAt
      ? formatScheduledForLabel(availability.pauseResumeAt, availability.timezone)
      : null;

    return (
      <div
        role="status"
        data-testid="store-availability-banner"
        data-status="paused"
        className={`mx-auto max-w-2xl rounded-2xl border border-amber-400/50 bg-gradient-to-r from-amber-950/75 via-black/80 to-pink-950/60 p-4 md:p-5 text-white backdrop-blur-xl shadow-[0_0_25px_rgba(245,158,11,0.2)] ${className}`}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-500/20 text-amber-300">
            <PauseCircle className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black uppercase tracking-wide text-amber-200">
                Barra saturada · Pedidos inmediatos en pausa
              </p>
              {resumeLabel && (
                <span className="rounded-full border border-amber-300/40 bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-100">
                  Volvemos aprox. {resumeLabel}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-200">{availability.pauseReason}</p>
            {availability.canScheduleOrders && (
              <p className="flex items-center gap-1.5 pt-1 text-xs font-semibold text-cyan-300">
                <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                <span>Puedes programar tu pedido para más tarde al finalizar la compra.</span>
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (availability.status === "closed") {
    return (
      <div
        role="status"
        data-testid="store-availability-banner"
        data-status="closed"
        className={`mx-auto max-w-2xl rounded-2xl border border-rose-500/45 bg-gradient-to-r from-rose-950/70 via-black/80 to-slate-950/80 p-4 md:p-5 text-white backdrop-blur-xl shadow-[0_0_25px_rgba(244,63,94,0.18)] ${className}`}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-rose-400/40 bg-rose-500/20 text-rose-300">
            <Clock className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-black uppercase tracking-wide text-rose-200">
              {storeName} está cerrado en este momento
            </p>
            <p className="text-xs text-slate-200">{availability.summaryText}</p>
            {availability.canScheduleOrders && (
              <p className="flex items-center gap-1.5 pt-1 text-xs font-semibold text-cyan-300">
                <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Arma tu carrito ahora y programa tu entrega o retiro dentro del horario del local.
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      data-testid="store-availability-banner"
      data-status="open"
      className={`mx-auto max-w-2xl rounded-2xl border border-emerald-500/30 bg-black/55 px-4 py-3 text-white backdrop-blur-xl ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] motion-safe:animate-pulse" />
          <span className="font-bold uppercase tracking-wider text-emerald-300">
            Abierto ahora
          </span>
          <span className="text-slate-300">{availability.summaryText}</span>
        </div>
        {availability.canScheduleOrders && (
          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-200">
            <CalendarClock className="h-3 w-3" />
            Pedidos programados activos
          </span>
        )}
      </div>
    </div>
  );
}
