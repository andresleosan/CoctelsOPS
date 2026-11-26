"use client";

import { useState } from "react";
import { Flame, PauseCircle, PlayCircle, Timer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_EMERGENCY_PAUSE_REASON,
  DEFAULT_STORE_TIMEZONE,
  formatScheduledForLabel,
  isEmergencyPauseActive,
} from "@/lib/orders/store-schedule";
import type { StoreConfiguration } from "@/types/operations";

export type EmergencyPauseControlProps = {
  configuration: StoreConfiguration;
  onConfigurationUpdated: (next: StoreConfiguration) => void;
  mode?: "bar" | "card";
  getAuthToken: () => Promise<string>;
};

export function EmergencyPauseControl({
  configuration,
  onConfigurationUpdated,
  mode = "bar",
  getAuthToken,
}: EmergencyPauseControlProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [customReason, setCustomReason] = useState(
    configuration.emergencyPause?.reason ?? DEFAULT_EMERGENCY_PAUSE_REASON,
  );

  const isPaused = isEmergencyPauseActive(configuration.emergencyPause);
  const timezone = configuration.timezone || DEFAULT_STORE_TIMEZONE;
  const resumeLabel =
    isPaused && configuration.emergencyPause?.resumeAt
      ? formatScheduledForLabel(configuration.emergencyPause.resumeAt, timezone)
      : null;

  async function togglePause(params: {
    active: boolean;
    durationMinutes?: number | null;
  }) {
    setSubmitting(true);
    setError("");
    try {
      const token = await getAuthToken();
      const response = await fetch("/api/admin/configuration", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          active: params.active,
          ...(params.active
            ? {
                reason: customReason.trim() || DEFAULT_EMERGENCY_PAUSE_REASON,
                durationMinutes:
                  params.durationMinutes !== undefined ? params.durationMinutes : null,
              }
            : {}),
        }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        configuration?: StoreConfiguration;
        error?: string;
      };
      if (!response.ok || !body.configuration) {
        throw new Error(body.error ?? "No se pudo actualizar la pausa de barra.");
      }
      onConfigurationUpdated(body.configuration);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la pausa.");
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === "bar") {
    return (
      <div
        data-testid="emergency-pause-bar-control"
        className={`rounded-xl border p-3.5 transition-colors ${
          isPaused
            ? "border-amber-400 bg-amber-50 text-amber-950"
            : "border-slate-200 bg-white text-slate-900"
        }`}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-2.5">
            {isPaused ? (
              <Flame className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            ) : (
              <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-cyan-700" />
            )}
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold">
                  {isPaused
                    ? "Barra saturada: pedidos inmediatos pausados"
                    : "Control rápido de recepción (Barra abierta)"}
                </p>
                {resumeLabel && (
                  <Badge
                    variant="outline"
                    className="border-amber-400 bg-white text-amber-950 font-semibold"
                  >
                    Reanuda {resumeLabel}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-700">
                {isPaused
                  ? configuration.emergencyPause?.reason || DEFAULT_EMERGENCY_PAUSE_REASON
                  : "Si la barra está al límite, pausa los pedidos inmediatos en 1 tap sin cerrar el menú."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isPaused ? (
              <Button
                type="button"
                size="sm"
                data-testid="btn-resume-store-orders"
                disabled={submitting}
                onClick={() => void togglePause({ active: false })}
                className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700 font-bold"
              >
                <PlayCircle className="mr-1.5 h-4 w-4" />
                {submitting ? "Reanudando..." : "Reanudar pedidos"}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="btn-pause-store-30m"
                  disabled={submitting}
                  onClick={() => void togglePause({ active: true, durationMinutes: 30 })}
                  className="min-h-[44px] border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 font-semibold"
                >
                  <Timer className="mr-1.5 h-4 w-4" />
                  Pausar 30 min
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="btn-pause-store-60m"
                  disabled={submitting}
                  onClick={() => void togglePause({ active: true, durationMinutes: 60 })}
                  className="min-h-[44px] border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 font-semibold"
                >
                  <Timer className="mr-1.5 h-4 w-4" />
                  Pausar 1 h
                </Button>
                <Button
                  type="button"
                  size="sm"
                  data-testid="btn-pause-store-manual"
                  disabled={submitting}
                  onClick={() => void togglePause({ active: true, durationMinutes: null })}
                  className="min-h-[44px] bg-rose-600 text-white hover:bg-rose-700 font-bold"
                >
                  <PauseCircle className="mr-1.5 h-4 w-4" />
                  Barra saturada
                </Button>
              </>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <Card
      data-testid="emergency-pause-card"
      className={
        isPaused
          ? "border-amber-400 bg-amber-50/90 text-slate-950"
          : "border-slate-200 bg-white text-slate-950"
      }
    >
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg text-slate-950">
            {isPaused ? (
              <Flame className="h-5 w-5 text-amber-700" />
            ) : (
              <PauseCircle className="h-5 w-5 text-cyan-700" />
            )}
            Pausa de emergencia (&quot;Barra Saturada&quot;)
          </CardTitle>
          <Badge
            variant="outline"
            className={
              isPaused
                ? "border-amber-400 bg-white text-amber-950 font-bold"
                : "border-emerald-300 bg-emerald-50 text-emerald-900 font-bold"
            }
          >
            {isPaused ? "Pausada" : "Operando normal"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-700">
          {isPaused
            ? resumeLabel
              ? `Pedidos inmediatos pausados. Reanudación automática estimada: ${resumeLabel}.`
              : "Pedidos inmediatos pausados de forma manual hasta que los reactives."
            : "Activa una pausa temporal cuando la barra esté saturada. Los clientes verán el aviso y podrán programar pedidos para más tarde."}
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="emergency-pause-reason" className="text-slate-900 font-semibold">
            Mensaje para el cliente durante la pausa
          </Label>
          <Input
            id="emergency-pause-reason"
            value={customReason}
            maxLength={240}
            onChange={(event) => setCustomReason(event.target.value)}
            placeholder={DEFAULT_EMERGENCY_PAUSE_REASON}
            className="min-h-[44px] border-slate-300 bg-white text-slate-900"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {isPaused ? (
            <Button
              type="button"
              data-testid="btn-resume-store-orders"
              disabled={submitting}
              onClick={() => void togglePause({ active: false })}
              className="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700 font-bold"
            >
              <PlayCircle className="mr-1.5 h-4 w-4" />
              {submitting ? "Reanudando..." : "Reanudar pedidos ahora"}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                data-testid="btn-pause-store-30m"
                disabled={submitting}
                onClick={() => void togglePause({ active: true, durationMinutes: 30 })}
                className="min-h-[44px] border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 font-semibold"
              >
                <Timer className="mr-1.5 h-4 w-4" />
                Pausar 30 min
              </Button>
              <Button
                type="button"
                variant="outline"
                data-testid="btn-pause-store-60m"
                disabled={submitting}
                onClick={() => void togglePause({ active: true, durationMinutes: 60 })}
                className="min-h-[44px] border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 font-semibold"
              >
                <Timer className="mr-1.5 h-4 w-4" />
                Pausar 1 h
              </Button>
              <Button
                type="button"
                data-testid="btn-pause-store-manual"
                disabled={submitting}
                onClick={() => void togglePause({ active: true, durationMinutes: null })}
                className="min-h-[44px] bg-rose-600 text-white hover:bg-rose-700 font-bold"
              >
                <PauseCircle className="mr-1.5 h-4 w-4" />
                Pausar indefinidamente
              </Button>
            </>
          )}
        </div>

        {error && (
          <p role="alert" className="text-xs font-semibold text-rose-700">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
