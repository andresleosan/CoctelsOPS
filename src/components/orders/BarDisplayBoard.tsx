"use client";

import Image from "next/image";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  Flame,
  Maximize2,
  Minimize2,
  PauseCircle,
  RefreshCw,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  detectNewlyReadyOrderIds,
  filterBarDisplayTickets,
} from "@/lib/orders/bar-display";
import type {
  BarDisplayServiceFilter,
  BarDisplaySnapshot,
  BarDisplayTicket,
} from "@/types/display";

export type BarDisplayBoardProps = {
  initialSnapshot?: BarDisplaySnapshot | null;
  initialSlug?: string;
  initialNegocioId?: string;
  pollIntervalMs?: number;
};

const DEFAULT_POLL_INTERVAL_MS = 8_000;
const NEW_READY_HIGHLIGHT_MS = 12_000;

function sanitizeDisplayLogo(logoUrl?: string): string {
  if (!logoUrl) return "/brand/coctels-ops-logo.png";
  const trimmed = logoUrl.trim();
  if (trimmed.startsWith("https://") || (trimmed.startsWith("/") && !trimmed.startsWith("//"))) {
    return trimmed;
  }
  return "/brand/coctels-ops-logo.png";
}

function formatServiceLabel(ticket: BarDisplayTicket): string {
  if (ticket.serviceType === "mesa") {
    return ticket.tableNumber ? ticket.tableNumber : "En Mesa";
  }
  if (ticket.serviceType === "pickup") {
    return "Retiro en barra";
  }
  return "Domicilio";
}

function formatReadyActionLabel(ticket: BarDisplayTicket): string {
  if (ticket.serviceType === "mesa") {
    return ticket.tableNumber ? `LISTO · ${ticket.tableNumber.toUpperCase()}` : "LISTO EN MESA";
  }
  if (ticket.serviceType === "pickup") {
    return "¡LISTO EN BARRA!";
  }
  return "LISTO · DOMICILIO";
}

function formatClockTime(date: Date): string {
  return date.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function playReadyChime(): void {
  if (typeof window === "undefined") return;
  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(659.25, now); // E5
    osc.frequency.setValueAtTime(880, now + 0.14); // A5
    osc.frequency.setValueAtTime(1046.5, now + 0.28); // C6
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);
  } catch {
    // Web Audio API puede requerir interacción previa; fallar silenciosamente.
  }
}

export function BarDisplayBoard({
  initialSnapshot = null,
  initialSlug = "",
  initialNegocioId = "",
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: BarDisplayBoardProps) {
  const [snapshot, setSnapshot] = useState<BarDisplaySnapshot | null>(initialSnapshot);
  const [loading, setLoading] = useState(!initialSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [serviceFilter, setServiceFilter] = useState<BarDisplayServiceFilter>("all");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [clockLabel, setClockLabel] = useState(() => formatClockTime(new Date()));
  const [justReadyIds, setJustReadyIds] = useState<string[]>([]);

  const seenReadyIdsRef = useRef<Set<string> | null>(
    initialSnapshot ? new Set(initialSnapshot.ready.map((t) => t.orderId)) : null,
  );
  const highlightTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (initialSlug.trim()) {
      params.set("slug", initialSlug.trim());
    } else if (initialNegocioId.trim()) {
      params.set("negocioId", initialNegocioId.trim());
    }
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [initialNegocioId, initialSlug]);

  const markNewlyReady = useCallback((addedIds: string[]) => {
    if (addedIds.length === 0) return;

    setJustReadyIds((prev) => Array.from(new Set([...prev, ...addedIds])));

    for (const id of addedIds) {
      const existing = highlightTimersRef.current.get(id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        setJustReadyIds((prev) => prev.filter((item) => item !== id));
        highlightTimersRef.current.delete(id);
      }, NEW_READY_HIGHLIGHT_MS);
      highlightTimersRef.current.set(id, timer);
    }
  }, []);

  const fetchSnapshot = useCallback(
    async (silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading((prev) => (snapshot ? prev : true));
        setRefreshing(true);
      }

      try {
        const res = await fetch(`/api/pantalla${queryString}`, { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as BarDisplaySnapshot & {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error ?? "No se pudo actualizar la pantalla de turnos.");
        }

        if (seenReadyIdsRef.current === null) {
          seenReadyIdsRef.current = new Set(data.ready.map((t) => t.orderId));
        } else {
          const addedReady = detectNewlyReadyOrderIds(seenReadyIdsRef.current, data.ready);
          if (addedReady.length > 0) {
            markNewlyReady(addedReady);
            if (soundEnabled) {
              playReadyChime();
            }
          }
          seenReadyIdsRef.current = new Set(data.ready.map((t) => t.orderId));
        }

        setSnapshot(data);
        setErrorMessage(null);
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "Error de conexión con la barra.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [markNewlyReady, queryString, snapshot, soundEnabled],
  );

  useEffect(() => {
    if (!initialSnapshot) {
      void fetchSnapshot(false);
    }
  }, [fetchSnapshot, initialSnapshot]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetchSnapshot(true);
    }, Math.max(2_000, pollIntervalMs));
    return () => window.clearInterval(timer);
  }, [fetchSnapshot, pollIntervalMs]);

  useEffect(() => {
    const clockTimer = window.setInterval(() => {
      setClockLabel(formatClockTime(new Date()));
    }, 1_000);
    return () => window.clearInterval(clockTimer);
  }, []);

  useEffect(() => {
    const timersMap = highlightTimersRef.current;
    return () => {
      for (const timer of timersMap.values()) {
        clearTimeout(timer);
      }
      timersMap.clear();
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Algunos navegadores móviles bloquean Fullscreen API; ignorar silenciosamente.
    }
  }

  const preparingTickets = useMemo(
    () => filterBarDisplayTickets(snapshot?.preparing ?? [], serviceFilter),
    [serviceFilter, snapshot?.preparing],
  );

  const readyTickets = useMemo(
    () => filterBarDisplayTickets(snapshot?.ready ?? [], serviceFilter),
    [serviceFilter, snapshot?.ready],
  );

  const storeName = snapshot?.storeName || "Coctels OPS";
  const logoSrc = sanitizeDisplayLogo(snapshot?.logoUrl);
  const usesExternalLogo = logoSrc.startsWith("https://");
  const menuHref = snapshot?.slug ? `/m/${encodeURIComponent(snapshot.slug)}` : "/menu";

  return (
    <div
      className="min-h-screen bg-black bg-ops-grid text-white flex flex-col justify-between p-4 sm:p-6 lg:p-8 selection:bg-primary selection:text-white"
      data-testid="bar-display-board"
    >
      <div className="mx-auto w-full max-w-[1600px] space-y-5 flex-1 flex flex-col">
        {/* Cabecera TV / Tablet */}
        <header className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-zinc-950/85 p-4 backdrop-blur-xl sm:p-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3.5">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-primary/70 bg-black shadow-[0_0_18px_rgba(229,25,110,0.45)]">
              <Image
                src={logoSrc}
                alt={`Logo ${storeName}`}
                fill
                sizes="48px"
                unoptimized={usesExternalLogo}
                className="object-cover"
                priority
              />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-headline text-xl font-black uppercase tracking-tight text-white sm:text-2xl lg:text-3xl">
                  {storeName} <span className="text-primary neon-text-magenta">· Turnos</span>
                </h1>
                <Badge className="inline-flex items-center gap-1.5 border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse motion-reduce:animate-none" />
                  En Vivo
                </Badge>
                {snapshot?.emergencyPauseActive ? (
                  <Badge
                    data-testid="bar-display-pause-badge"
                    className="inline-flex items-center gap-1.5 border border-amber-400/50 bg-amber-500/20 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-amber-200"
                  >
                    <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    Barra en pausa
                  </Badge>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-zinc-400 sm:text-sm">
                {snapshot?.emergencyPauseActive && snapshot.emergencyPauseReason
                  ? snapshot.emergencyPauseReason
                  : "Revisa tu código de turno o nombre para recoger tu granizado en barra."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            <div
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-black/60 px-3.5 text-sm font-bold tabular-nums text-cyan-300"
              aria-label="Hora actual"
            >
              <Clock className="h-4 w-4 text-cyan-400" aria-hidden="true" />
              {clockLabel}
            </div>

            <div
              className="inline-flex rounded-xl border border-white/10 bg-black/60 p-1"
              role="group"
              aria-label="Filtro de canal de turnos"
            >
              <Button
                type="button"
                size="sm"
                variant={serviceFilter === "all" ? "default" : "ghost"}
                onClick={() => setServiceFilter("all")}
                className={`min-h-10 rounded-lg px-3 text-xs font-bold uppercase tracking-wider ${
                  serviceFilter === "all"
                    ? "bg-primary text-white hover:bg-primary/90"
                    : "text-zinc-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                Todos
              </Button>
              <Button
                type="button"
                size="sm"
                variant={serviceFilter === "local" ? "default" : "ghost"}
                onClick={() => setServiceFilter("local")}
                className={`min-h-10 rounded-lg px-3 text-xs font-bold uppercase tracking-wider ${
                  serviceFilter === "local"
                    ? "bg-cyan-500 text-black hover:bg-cyan-400"
                    : "text-zinc-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                Barra y Mesas
              </Button>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => setSoundEnabled((prev) => !prev)}
              aria-pressed={soundEnabled}
              aria-label={soundEnabled ? "Silenciar timbre de turnos listos" : "Activar timbre de turnos listos"}
              className={`min-h-11 rounded-xl border-white/15 bg-black/60 px-3.5 text-xs font-bold uppercase tracking-wider ${
                soundEnabled ? "border-cyan-400/50 text-cyan-300" : "text-zinc-300"
              } hover:bg-white/10 hover:text-white`}
            >
              {soundEnabled ? (
                <Volume2 className="mr-1.5 h-4 w-4 text-cyan-400" aria-hidden="true" />
              ) : (
                <VolumeX className="mr-1.5 h-4 w-4 text-zinc-400" aria-hidden="true" />
              )}
              {soundEnabled ? "Sonido ON" : "Sonido OFF"}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => void fetchSnapshot(false)}
              disabled={refreshing}
              className="min-h-11 rounded-xl border-white/15 bg-black/60 px-3.5 text-xs font-bold uppercase tracking-wider text-zinc-200 hover:bg-white/10 hover:text-white"
            >
              <RefreshCw
                className={`mr-1.5 h-4 w-4 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`}
                aria-hidden="true"
              />
              Actualizar
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => void toggleFullscreen()}
              aria-label={isFullscreen ? "Salir de pantalla completa" : "Activar pantalla completa"}
              className="min-h-11 rounded-xl border-white/15 bg-black/60 px-3.5 text-xs font-bold uppercase tracking-wider text-zinc-200 hover:bg-white/10 hover:text-white"
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </header>

        {errorMessage ? (
          <div
            role="status"
            className="rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 py-3 text-sm font-medium text-amber-200"
          >
            {errorMessage}
          </div>
        ) : null}

        {/* Tablero 2 Columnas: En preparación | Listo para recoger */}
        {loading && !snapshot ? (
          <div className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="h-80 rounded-2xl border border-cyan-500/20 bg-zinc-950/70 animate-pulse motion-reduce:animate-none" />
            <div className="h-80 rounded-2xl border border-primary/30 bg-zinc-950/70 animate-pulse motion-reduce:animate-none" />
          </div>
        ) : (
          <div className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Columna 1: En preparación */}
            <section
              data-testid="bar-display-preparing-column"
              aria-label="Pedidos en preparación"
              className="flex flex-col rounded-2xl border border-cyan-500/30 bg-zinc-950/85 p-5 backdrop-blur-xl"
            >
              <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300 border border-cyan-400/30">
                    <Flame className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="font-headline text-xl font-black uppercase tracking-tight text-cyan-300 neon-text-cyan sm:text-2xl">
                      En preparación
                    </h2>
                    <p className="text-xs text-zinc-400">Mezclando tu granizado en barra</p>
                  </div>
                </div>
                <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-500/15 px-3 text-base font-black tabular-nums text-cyan-200">
                  {preparingTickets.length}
                </span>
              </div>

              {preparingTickets.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/40 p-8 text-center">
                  <Sparkles className="mb-2 h-8 w-8 text-cyan-400/70" aria-hidden="true" />
                  <p className="font-headline text-base font-bold uppercase text-zinc-200">
                    Barra al día
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    Los nuevos pedidos aparecerán aquí apenas inicien preparación.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {preparingTickets.map((ticket) => (
                    <article
                      key={ticket.orderId}
                      data-testid={`display-preparing-${ticket.orderId}`}
                      className="flex flex-col justify-between rounded-xl border border-cyan-500/25 bg-black/75 p-4 transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-headline text-3xl font-black tracking-tight tabular-nums text-cyan-300">
                          {ticket.turnCode}
                        </span>
                        <Badge className="border border-white/15 bg-white/10 text-[11px] font-semibold uppercase tracking-wide text-zinc-200">
                          {formatServiceLabel(ticket)}
                        </Badge>
                      </div>
                      <div className="mt-3 flex items-baseline justify-between gap-2">
                        <p className="truncate text-lg font-bold text-white">
                          {ticket.displayName}
                        </p>
                        <span className="shrink-0 text-xs font-medium tabular-nums text-zinc-400">
                          {ticket.itemsCount} {ticket.itemsCount === 1 ? "bebida" : "bebidas"}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* Columna 2: Listo para recoger */}
            <section
              data-testid="bar-display-ready-column"
              aria-label="Pedidos listos para recoger"
              className="flex flex-col rounded-2xl border border-primary/40 bg-zinc-950/90 p-5 shadow-[0_0_35px_rgba(229,25,110,0.16)] backdrop-blur-xl"
            >
              <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-primary border border-primary/40">
                    <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="font-headline text-xl font-black uppercase tracking-tight text-primary neon-text-magenta sm:text-2xl">
                      Listo para recoger
                    </h2>
                    <p className="text-xs text-zinc-400">Pasa por tu pedido al punto de entrega</p>
                  </div>
                </div>
                <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full border border-primary/50 bg-primary/20 px-3 text-base font-black tabular-nums text-pink-200">
                  {readyTickets.length}
                </span>
              </div>

              {readyTickets.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/40 p-8 text-center">
                  <CheckCircle2 className="mb-2 h-8 w-8 text-primary/70" aria-hidden="true" />
                  <p className="font-headline text-base font-bold uppercase text-zinc-200">
                    Esperando entregas listas
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    Cuando tu turno pase a listo brillará aquí en pantalla.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  {readyTickets.map((ticket) => {
                    const isJustReady = justReadyIds.includes(ticket.orderId);
                    return (
                      <article
                        key={ticket.orderId}
                        data-testid={`display-ready-${ticket.orderId}`}
                        className={`flex flex-col justify-between rounded-2xl border p-5 transition-all ${
                          isJustReady
                            ? "border-primary bg-primary/20 neon-shadow-magenta ring-2 ring-primary/70 animate-pulse motion-reduce:animate-none"
                            : "border-primary/45 bg-gradient-to-br from-primary/15 via-black to-purple-950/30 shadow-[0_0_20px_rgba(229,25,110,0.2)]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-headline text-4xl font-black tracking-tight tabular-nums text-white neon-text-magenta sm:text-5xl">
                            {ticket.turnCode}
                          </span>
                          <Badge className="border border-primary/50 bg-primary text-[11px] font-black uppercase tracking-wider text-white">
                            {formatReadyActionLabel(ticket)}
                          </Badge>
                        </div>
                        <div className="mt-4 flex items-baseline justify-between gap-2">
                          <p className="truncate text-xl font-extrabold text-white">
                            {ticket.displayName}
                          </p>
                          <span className="shrink-0 text-xs font-semibold tabular-nums text-pink-200">
                            {ticket.itemsCount} {ticket.itemsCount === 1 ? "bebida" : "bebidas"}
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* Pie compacto con acceso al menú */}
        <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-zinc-950/75 px-4 py-2.5 text-xs text-zinc-400">
          <span>
            Actualización automática activa · Último refresco:{" "}
            <strong className="tabular-nums text-zinc-200">
              {snapshot?.updatedAt
                ? new Date(snapshot.updatedAt).toLocaleTimeString("es-CO", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })
                : "—"}
            </strong>
          </span>
          <Link
            href={menuHref}
            className="inline-flex min-h-10 items-center rounded-lg border border-white/15 bg-black/50 px-3 font-semibold text-cyan-300 transition-colors hover:border-cyan-400 hover:text-cyan-200"
          >
            Ver Carta Pública
          </Link>
        </footer>
      </div>
    </div>
  );
}
