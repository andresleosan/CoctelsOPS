'use client';

import { useEffect, useState } from 'react';
import { Clock, Flame, Sparkles, ChevronRight, Zap } from 'lucide-react';
import type { Promotion } from '@/types/promotions';

interface HappyHourBannerProps {
  initialPromotion?: Promotion | null;
  onExploreCategory?: (category: string) => void;
}

function calculateSecondsRemaining(endTime: string, now: Date): number {
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const target = new Date(now);
  target.setHours(endHour, endMinute, 0, 0);
  const diffMs = target.getTime() - now.getTime();
  return Math.max(0, Math.floor(diffMs / 1000));
}

function formatCountdown(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
}

export function HappyHourBanner({ initialPromotion, onExploreCategory }: HappyHourBannerProps) {
  const [activePromo, setActivePromo] = useState<Promotion | null>(initialPromotion ?? null);
  const [scheduledPromo, setScheduledPromo] = useState<Promotion | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(!initialPromotion);

  // Carga inicial y sincronización con el servidor
  useEffect(() => {
    let isMounted = true;

    async function fetchPromos() {
      try {
        const res = await fetch('/api/promotions/active');
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;

        const active = (data.activeHappyHours?.[0] as Promotion) ?? null;
        const scheduled = (data.todayScheduled?.[0] as Promotion) ?? null;

        setActivePromo(active);
        setScheduledPromo(scheduled);

        if (active?.schedule?.endTime) {
          const now = data.serverTime ? new Date(data.serverTime) : new Date();
          setSecondsLeft(calculateSecondsRemaining(active.schedule.endTime, now));
        }
      } catch {
        // En caso de error de red, mantener estado silencioso
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void fetchPromos();

    return () => {
      isMounted = false;
    };
  }, []);

  // Timer regresivo por segundo
  useEffect(() => {
    if (!activePromo?.schedule?.endTime) return;

    // Calcular segundos iniciales
    setSecondsLeft(calculateSecondsRemaining(activePromo.schedule.endTime, new Date()));

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          // El Happy Hour acaba de finalizar, refrescar estado
          setActivePromo(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activePromo]);

  if (loading && !activePromo && !scheduledPromo) {
    return null;
  }

  // 1. Caso: Happy Hour ACTIVO en este momento
  if (activePromo) {
    const is2x1 = activePromo.discountType === '2x1';
    const discountText = is2x1
      ? '¡2x1 en Barra!'
      : activePromo.discountType === 'percent'
      ? `${activePromo.discountValue}% OFF`
      : `$${activePromo.discountValue.toLocaleString('es-CO')} COP OFF`;

    return (
      <aside
        aria-label="Promoción Happy Hour activa"
        className="relative overflow-hidden rounded-2xl border border-pink-500/40 bg-gradient-to-r from-slate-950 via-pink-950/40 to-slate-950 p-4 shadow-[0_0_25px_rgba(229,25,110,0.25)] transition-all"
      >
        {/* Glow de fondo decorativo */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-pink-500/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-12 -left-12 h-32 w-32 rounded-full bg-cyan-500/20 blur-3xl"
        />

        <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-500/20 px-2.5 py-0.5 text-xs font-black uppercase tracking-wider text-pink-400 border border-pink-500/30 animate-pulse">
                <Flame className="h-3.5 w-3.5 text-pink-500 fill-pink-500" />
                Happy Hour Activo
              </span>
              {activePromo.schedule && (
                <span className="inline-flex items-center gap-1 rounded-md bg-cyan-950/50 px-2 py-0.5 text-xs font-mono text-cyan-300 border border-cyan-500/30">
                  <Clock className="h-3 w-3 text-cyan-400" />
                  Termina en {formatCountdown(secondsLeft)}
                </span>
              )}
            </div>

            <h3 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-1.5">
              <span>{activePromo.title || `Happy Hour: ${discountText}`}</span>
              <Sparkles className="h-4 w-4 text-pink-400" />
            </h3>

            <p className="text-xs sm:text-sm text-slate-300">
              {activePromo.description ||
                (is2x1
                  ? 'Agrega 2 granizados elegibles al carrito y el segundo va por cuenta de la casa.'
                  : `Aprovecha el descuento especial de ${discountText} en productos seleccionados.`)}
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1 sm:pt-0">
            <button
              type="button"
              onClick={() => {
                const targetCat = activePromo.categoryIds?.[0] || 'granizado';
                if (onExploreCategory) {
                  onExploreCategory(targetCat);
                } else {
                  const element = document.getElementById(targetCat) || document.querySelector(`[data-category="${targetCat}"]`);
                  element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
              className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl bg-pink-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-pink-600/30 transition-all hover:bg-pink-500 active:scale-95"
            >
              <span>Aprovechar {is2x1 ? '2x1' : 'Promo'}</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    );
  }

  // 2. Caso: Happy Hour programado para HOY pero aún no iniciado
  if (scheduledPromo?.schedule) {
    return (
      <aside
        aria-label="Próximo Happy Hour de hoy"
        className="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-slate-950 via-cyan-950/20 to-slate-950 p-3.5 shadow-sm"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  Próximo Happy Hour Hoy
                </span>
                <span className="rounded bg-cyan-950/60 px-1.5 py-0.5 text-[11px] font-mono text-cyan-300 border border-cyan-800/40">
                  {scheduledPromo.schedule.startTime} - {scheduledPromo.schedule.endTime}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                {scheduledPromo.title || '¡Alístate para las promociones 2x1 y precios especiales de la tarde!'}
              </p>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  return null;
}
