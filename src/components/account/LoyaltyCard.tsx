'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Award, CheckCircle2, Flame, Gift, GlassWater, Sparkles, Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { LOYALTY_REWARDS, LOYALTY_STAMPS_PER_CARD, type LoyaltySummary } from '@/types/loyalty';

export type LoyaltyCardProps = {
  initialSummary?: LoyaltySummary | null;
};

export function LoyaltyCard({ initialSummary = null }: LoyaltyCardProps) {
  const { user } = useAuth();
  const [summary, setSummary] = useState<LoyaltySummary | null>(initialSummary);
  const [loading, setLoading] = useState(!initialSummary);

  useEffect(() => {
    if (initialSummary) {
      setSummary(initialSummary);
      setLoading(false);
      return;
    }
    if (!user) return;

    let active = true;
    const loadLoyalty = async () => {
      try {
        const token = typeof user.getIdToken === 'function' ? await user.getIdToken() : '';
        const response = await fetch('/api/loyalty', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) return;
        const data = (await response.json()) as { loyalty?: LoyaltySummary };
        if (active && data.loyalty) {
          setSummary(data.loyalty);
        }
      } catch {
        // Fallback silencioso
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadLoyalty();
    return () => {
      active = false;
    };
  }, [initialSummary, user]);

  const availablePoints = summary?.availablePoints ?? 0;
  const lifetimePoints = summary?.lifetimeEarnedPoints ?? 0;
  const stampsInCard = summary?.stampsInCurrentCard ?? 0;
  const completedCards = summary?.completedStampCards ?? 0;
  const tierName = summary?.tier.name ?? 'Bronce Neón';
  const tierBadge = summary?.tier.badgeColor ?? 'text-amber-400 border-amber-400/30 bg-amber-500/10';
  const nextTier = summary?.nextTier ?? null;
  const pointsToNextTier = summary?.pointsToNextTier ?? 50;

  return (
    <Card
      data-testid="loyalty-card"
      className="overflow-hidden border-primary/30 bg-slate-950/90 shadow-2xl shadow-primary/15"
    >
      <CardHeader className="border-b border-white/10 bg-gradient-to-r from-primary/20 via-purple-900/20 to-cyan-500/15 p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Club Fidelización OPS
            </p>
            <CardTitle className="font-headline text-xl font-black uppercase tracking-tight text-white md:text-2xl">
              Puntos Coctels &amp; Sellos Digitales
            </CardTitle>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-black uppercase tracking-wider ${tierBadge}`}
          >
            <Award className="h-4 w-4" />
            {tierName}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-5 md:p-6">
        {/* Resumen de Puntos y Regla de Acumulación */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-pink-200/80">
              Saldo Disponible
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <span
                data-testid="loyalty-available-points"
                className="font-headline text-3xl font-black text-white md:text-4xl"
              >
                {loading ? '...' : availablePoints}
              </span>
              <span className="text-sm font-bold uppercase text-primary">Puntos Coctels</span>
            </div>
            <p className="mt-2 text-xs text-slate-300">
              Ganas <strong>1 punto por cada $1.000 COP</strong> en tus pedidos entregados.
            </p>
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-cyan-500/25 bg-cyan-950/20 p-4">
            <div>
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-cyan-300">
                <span>Progreso VIP</span>
                <span>{lifetimePoints} pts históricos</span>
              </div>
              {nextTier ? (
                <p className="mt-1.5 text-xs text-slate-300">
                  Te faltan <strong>{pointsToNextTier} pts</strong> para subir a{' '}
                  <span className="font-bold text-cyan-300">{nextTier.name}</span>.
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-emerald-300 font-semibold">
                  ¡Alcanzaste el nivel máximo Oro Opsy VIP!
                </p>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5 text-xs text-slate-400">
              <span>Pedidos entregados: {summary?.deliveredOrdersCount ?? 0}</span>
              {completedCards > 0 && (
                <span className="font-bold text-emerald-400">
                  {completedCards} {completedCards === 1 ? 'tarjeta llena' : 'tarjetas llenas'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tarjeta Interactiva de 10 Sellos Digitales */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                <Flame className="h-4 w-4 text-primary" /> Tarjeta de Sellos Digitales
              </h3>
              <p className="text-xs text-slate-400">
                1 sello por cada pedido entregado desde $10.000 COP ({stampsInCard}/{LOYALTY_STAMPS_PER_CARD} sellos)
              </p>
            </div>
            <span className="rounded-lg bg-white/5 px-2.5 py-1 text-xs font-bold text-cyan-300">
              {stampsInCard} / {LOYALTY_STAMPS_PER_CARD}
            </span>
          </div>

          <div
            className="grid grid-cols-5 gap-2.5 sm:grid-cols-10"
            role="list"
            aria-label="Sellos digitales acumulados"
          >
            {Array.from({ length: LOYALTY_STAMPS_PER_CARD }, (_, index) => {
              const stampNumber = index + 1;
              const isStamped = stampNumber <= stampsInCard;
              return (
                <div
                  key={stampNumber}
                  role="listitem"
                  data-testid={`loyalty-stamp-${stampNumber}`}
                  data-stamped={isStamped ? 'true' : 'false'}
                  className={`flex aspect-square flex-col items-center justify-center rounded-xl border text-xs font-black transition-all ${
                    isStamped
                      ? 'border-primary bg-primary/25 text-white shadow-[0_0_12px_rgba(229,25,110,0.4)]'
                      : 'border-white/10 bg-slate-950/60 text-slate-600'
                  }`}
                >
                  {isStamped ? (
                    <GlassWater className="h-4 w-4 text-primary" />
                  ) : (
                    <span>{stampNumber}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Catálogo de Recompensas Canjeables en Checkout */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
              <Gift className="h-4 w-4 text-cyan-400" /> Recompensas Canjeables
            </h3>
            <span className="text-xs text-slate-400">Usa tus puntos en el Checkout</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {LOYALTY_REWARDS.map((reward) => {
              const unlocked = availablePoints >= reward.pointsCost;
              const missingPoints = Math.max(0, reward.pointsCost - availablePoints);
              return (
                <div
                  key={reward.id}
                  data-testid={`loyalty-reward-${reward.id}`}
                  className={`flex flex-col justify-between rounded-2xl border p-4 transition-all ${
                    unlocked
                      ? 'border-emerald-500/40 bg-emerald-950/20'
                      : 'border-white/10 bg-slate-900/40 opacity-85'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2.5 py-0.5 text-[11px] font-black text-primary">
                        <Star className="h-3 w-3 fill-primary" /> {reward.pointsCost} pts
                      </span>
                      {unlocked && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Disponible
                        </span>
                      )}
                    </div>
                    <p className="mt-2.5 font-bold text-sm text-white">{reward.title}</p>
                    <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                      {reward.description}
                    </p>
                  </div>

                  <div className="mt-4 pt-2 border-t border-white/10">
                    {unlocked ? (
                      <Button
                        asChild
                        size="sm"
                        className="w-full h-9 rounded-xl bg-primary text-white hover:bg-primary/90 font-bold text-xs"
                      >
                        <Link href={`/checkout?reward=${reward.id}`}>Canjear en Checkout</Link>
                      </Button>
                    ) : (
                      <p className="text-[11px] font-semibold text-slate-400 text-center">
                        Te faltan {missingPoints} pts
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
