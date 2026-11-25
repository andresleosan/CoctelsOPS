"use client";

import { MapPin, Plus, Power, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugifyDeliveryZoneId } from "@/lib/orders/delivery-zones";
import type { DeliveryZoneConfig } from "@/types/operations";

export type DeliveryZonesEditorProps = {
  zones: DeliveryZoneConfig[];
  defaultEstimatedMinutes: number;
  onChange: (nextZones: DeliveryZoneConfig[]) => void;
};

function ensureUniqueZoneId(baseName: string, currentZones: DeliveryZoneConfig[], ignoreIndex: number): string {
  const baseSlug = slugifyDeliveryZoneId(baseName);
  const existingIds = new Set(
    currentZones
      .filter((_, index) => index !== ignoreIndex)
      .map((zone) => zone.id.trim().toLowerCase()),
  );
  if (!existingIds.has(baseSlug)) return baseSlug;
  let suffix = 2;
  while (existingIds.has(`${baseSlug}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseSlug}-${suffix}`;
}

export function DeliveryZonesEditor({
  zones,
  defaultEstimatedMinutes,
  onChange,
}: DeliveryZonesEditorProps) {
  const activeCount = zones.filter((zone) => zone.active).length;

  function handleUpdateZone(index: number, patch: Partial<DeliveryZoneConfig>) {
    const nextZones = zones.map((zone, itemIndex) => {
      if (itemIndex !== index) return zone;
      const updated = { ...zone, ...patch };
      if (typeof patch.name === "string" && zone.id.startsWith("zona-nueva-")) {
        const cleanName = patch.name.trim();
        if (cleanName) {
          updated.id = ensureUniqueZoneId(cleanName, zones, index);
        }
      }
      return updated;
    });
    onChange(nextZones);
  }

  function handleAddZone() {
    const nextNumber = zones.length + 1;
    const baseName = `Zona ${nextNumber}`;
    const uniqueId = ensureUniqueZoneId(baseName, zones, -1);
    onChange([
      ...zones,
      {
        id: uniqueId,
        name: baseName,
        feeCop: 4000,
        estimatedMinutes: Math.max(5, Math.min(240, Math.round(defaultEstimatedMinutes || 45))),
        active: true,
      },
    ]);
  }

  function handleRemoveZone(index: number) {
    if (zones.length <= 1) return;
    onChange(zones.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="space-y-4" data-testid="delivery-zones-editor">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-cyan-700" aria-hidden="true" />
            <p className="text-sm font-bold text-slate-900">
              Zonas de cobertura y tarifas dinámicas
            </p>
            <Badge
              variant="outline"
              className="border-cyan-200 bg-cyan-50 text-xs font-semibold text-cyan-900"
            >
              {activeCount} {activeCount === 1 ? "activa" : "activas"}
            </Badge>
          </div>
          <p className="text-xs text-slate-600">
            Define la tarifa en COP, tiempo estimado y monto opcional para domicilio gratis por barrio o sector.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          data-testid="btn-add-delivery-zone"
          onClick={handleAddZone}
          className="min-h-11 gap-1.5 border-slate-300 bg-white font-semibold text-slate-900 hover:bg-slate-50"
        >
          <Plus className="h-4 w-4 text-cyan-700" /> Agregar zona
        </Button>
      </div>

      <div className="space-y-3">
        {zones.map((zone, index) => {
          const nameId = `zone-name-${index}`;
          const feeId = `zone-fee-${index}`;
          const etaId = `zone-eta-${index}`;
          const freeMinId = `zone-free-min-${index}`;

          return (
            <div
              key={`${zone.id}-${index}`}
              data-testid={`delivery-zone-row-${index}`}
              className={`rounded-xl border p-4 transition-colors ${
                zone.active
                  ? "border-slate-200 bg-slate-50/70"
                  : "border-slate-200 bg-slate-100/70 opacity-75"
              }`}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
                <div className="space-y-1 lg:col-span-4">
                  <Label htmlFor={nameId} className="text-xs font-semibold text-slate-800">
                    Zona / Barrio
                  </Label>
                  <Input
                    id={nameId}
                    required
                    value={zone.name}
                    placeholder="Ej: Laureles"
                    onChange={(event) => handleUpdateZone(index, { name: event.target.value })}
                    className="h-11 border-slate-300 bg-white text-slate-900"
                  />
                </div>

                <div className="space-y-1 lg:col-span-2">
                  <Label htmlFor={feeId} className="text-xs font-semibold text-slate-800">
                    Tarifa COP {zone.feeCop === 0 ? "(Gratis)" : ""}
                  </Label>
                  <Input
                    id={feeId}
                    type="number"
                    min={0}
                    max={200000}
                    step={500}
                    value={zone.feeCop}
                    onChange={(event) =>
                      handleUpdateZone(index, {
                        feeCop: Math.max(0, Math.round(Number(event.target.value) || 0)),
                      })
                    }
                    className="h-11 border-slate-300 bg-white text-slate-900"
                  />
                </div>

                <div className="space-y-1 lg:col-span-2">
                  <Label htmlFor={etaId} className="text-xs font-semibold text-slate-800">
                    Tiempo (min)
                  </Label>
                  <Input
                    id={etaId}
                    type="number"
                    min={5}
                    max={240}
                    value={zone.estimatedMinutes}
                    onChange={(event) =>
                      handleUpdateZone(index, {
                        estimatedMinutes: Math.max(
                          5,
                          Math.min(240, Math.round(Number(event.target.value) || 5)),
                        ),
                      })
                    }
                    className="h-11 border-slate-300 bg-white text-slate-900"
                  />
                </div>

                <div className="space-y-1 lg:col-span-2">
                  <Label htmlFor={freeMinId} className="text-xs font-semibold text-slate-800">
                    Gratis desde COP
                  </Label>
                  <Input
                    id={freeMinId}
                    type="number"
                    min={0}
                    max={5000000}
                    step={1000}
                    placeholder="Opcional"
                    value={zone.freeDeliveryMinCop ?? ""}
                    onChange={(event) => {
                      const raw = event.target.value.trim();
                      const parsed = Number(raw);
                      handleUpdateZone(index, {
                        freeDeliveryMinCop:
                          raw && Number.isFinite(parsed) && parsed > 0
                            ? Math.round(parsed)
                            : undefined,
                      });
                    }}
                    className="h-11 border-slate-300 bg-white text-slate-900"
                  />
                </div>

                <div className="flex items-center gap-2 lg:col-span-2 lg:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    aria-pressed={zone.active}
                    data-testid={`btn-toggle-zone-${index}`}
                    onClick={() => handleUpdateZone(index, { active: !zone.active })}
                    className={`min-h-11 flex-1 gap-1.5 text-xs font-semibold lg:flex-initial ${
                      zone.active
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <Power className="h-3.5 w-3.5" />
                    {zone.active ? "Activa" : "Pausada"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    data-testid={`btn-remove-zone-${index}`}
                    disabled={zones.length <= 1}
                    aria-label={`Eliminar zona ${zone.name || index + 1}`}
                    onClick={() => handleRemoveZone(index)}
                    className="min-h-11 min-w-11 border-slate-300 bg-white text-rose-700 hover:bg-rose-50 hover:text-rose-800 disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
