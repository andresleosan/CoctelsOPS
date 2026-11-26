"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { DeliveryZonesEditor } from "@/components/admin/DeliveryZonesEditor";
import { EmergencyPauseControl } from "@/components/admin/EmergencyPauseControl";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { QrGeneratorCard } from "@/components/admin/QrGeneratorCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import {
  resolveDeliveryZones,
  syncLegacyDeliveryZones,
} from "@/lib/orders/delivery-zones";
import {
  DEFAULT_STORE_TIMEZONE,
  resolveScheduledOrdersConfig,
} from "@/lib/orders/store-schedule";
import {
  DEFAULT_STORE_CONFIGURATION,
  type DeliveryZoneConfig,
  type ScheduledOrdersConfig,
  type StoreConfiguration,
} from "@/types/operations";

export default function ConfigurationPage() {
  const { user } = useAuth();
  const [configuration, setConfiguration] = useState<StoreConfiguration>(DEFAULT_STORE_CONFIGURATION);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await fetch("/api/admin/configuration", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const body = (await response.json()) as { configuration?: StoreConfiguration; error?: string };
      if (!response.ok) throw new Error(body.error);
      if (body.configuration) setConfiguration(body.configuration);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cargar la configuración.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const editableZones = resolveDeliveryZones(configuration, { includeInactive: true });
  const scheduledConfig = resolveScheduledOrdersConfig(configuration);

  function handleZonesChange(nextZones: DeliveryZoneConfig[]) {
    setConfiguration({
      ...configuration,
      deliveryZoneRates: nextZones,
      deliveryZones: syncLegacyDeliveryZones(nextZones),
    });
  }

  function updateScheduledConfig(patch: Partial<ScheduledOrdersConfig>) {
    setConfiguration({
      ...configuration,
      scheduledOrders: {
        ...scheduledConfig,
        ...patch,
      },
    });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setMessage("");
    try {
      const normalizedRates = resolveDeliveryZones(configuration, { includeInactive: true });
      const payload: StoreConfiguration = {
        ...configuration,
        timezone: configuration.timezone?.trim() || DEFAULT_STORE_TIMEZONE,
        scheduledOrders: scheduledConfig,
        deliveryZoneRates: normalizedRates,
        deliveryZones: syncLegacyDeliveryZones(normalizedRates),
      };
      const response = await fetch("/api/admin/configuration", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { configuration?: StoreConfiguration; error?: string };
      if (!response.ok) throw new Error(body.error);
      if (body.configuration) setConfiguration(body.configuration);
      setMessage("Configuración guardada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la configuración.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminGuard permission="configuracion.read">
      <div className="space-y-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">Negocio</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">Configuración</h1>
            <p className="mt-1 text-sm text-slate-500">
              Canales, horarios, zonas, mensajes de atención y códigos QR de mesa.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
            className="min-h-[44px] gap-2 border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
          >
            <RefreshCw className={loading ? "animate-spin" : ""} /> Actualizar
          </Button>
        </header>

        {message && (
          <p role="status" className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
            {message}
          </p>
        )}

        {/* Control de Pausa de Emergencia ("Barra Saturada") */}
        <PermissionGate permission="configuracion.write">
          <EmergencyPauseControl
            mode="card"
            configuration={configuration}
            onConfigurationUpdated={setConfiguration}
            getAuthToken={async () => (user ? user.getIdToken() : "")}
          />
        </PermissionGate>

        {/* Generador de Códigos QR para Mesas y Barra */}
        <section aria-label="Generador de Códigos QR">
          <QrGeneratorCard defaultSlug="principal" storeName="Coctels OPS" />
        </section>

        {/* Formulario de Configuración Operativa */}
        <PermissionGate permission="configuracion.write">
          <form onSubmit={save} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Entrega y contacto</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="whatsapp">WhatsApp internacional</Label>
                  <Input
                    id="whatsapp"
                    className="border-slate-300 bg-white text-slate-900"
                    value={configuration.whatsappNumber}
                    onChange={(event) =>
                      setConfiguration({ ...configuration, whatsappNumber: event.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="estimated">Tiempo estimado (minutos)</Label>
                  <Input
                    id="estimated"
                    type="number"
                    min="1"
                    max="240"
                    className="border-slate-300 bg-white text-slate-900"
                    value={configuration.estimatedDeliveryMinutes}
                    onChange={(event) =>
                      setConfiguration({
                        ...configuration,
                        estimatedDeliveryMinutes: Number(event.target.value),
                      })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <DeliveryZonesEditor
                    zones={editableZones}
                    defaultEstimatedMinutes={configuration.estimatedDeliveryMinutes}
                    onChange={handleZonesChange}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Horarios</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {configuration.businessHours.map((hour, index) => (
                  <div
                    key={hour.day}
                    className={`rounded-lg border p-3 ${
                      hour.closed
                        ? "border-slate-200 bg-slate-100 text-slate-500"
                        : "border-slate-200 bg-white text-slate-900"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{hour.day}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-pressed={!hour.closed}
                        onClick={() =>
                          setConfiguration({
                            ...configuration,
                            businessHours: configuration.businessHours.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, closed: !item.closed } : item,
                            ),
                          })
                        }
                        className={`min-h-[36px] px-2.5 text-xs font-bold ${
                          hour.closed
                            ? "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100"
                            : "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                        }`}
                      >
                        {hour.closed ? "Cerrado" : "Abierto"}
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        aria-label={`${hour.day} apertura`}
                        type="time"
                        disabled={Boolean(hour.closed)}
                        className="border-slate-300 bg-white text-slate-900"
                        value={hour.open}
                        onChange={(event) =>
                          setConfiguration({
                            ...configuration,
                            businessHours: configuration.businessHours.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, open: event.target.value } : item
                            ),
                          })
                        }
                      />
                      <Input
                        aria-label={`${hour.day} cierre`}
                        type="time"
                        disabled={Boolean(hour.closed)}
                        className="border-slate-300 bg-white text-slate-900"
                        value={hour.close}
                        onChange={(event) =>
                          setConfiguration({
                            ...configuration,
                            businessHours: configuration.businessHours.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, close: event.target.value } : item
                            ),
                          })
                        }
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-lg">Pedidos programados</CardTitle>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-pressed={scheduledConfig.enabled}
                    onClick={() => updateScheduledConfig({ enabled: !scheduledConfig.enabled })}
                    className={`min-h-[44px] px-3 font-bold ${
                      scheduledConfig.enabled
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                        : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {scheduledConfig.enabled ? "Habilitados" : "Deshabilitados"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="slotInterval">Intervalo de franjas (min)</Label>
                  <select
                    id="slotInterval"
                    value={scheduledConfig.slotIntervalMinutes}
                    onChange={(event) =>
                      updateScheduledConfig({ slotIntervalMinutes: Number(event.target.value) })
                    }
                    className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                  >
                    <option value={15}>Cada 15 minutos</option>
                    <option value={30}>Cada 30 minutos</option>
                    <option value={60}>Cada 60 minutos</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="minLead">Anticipación mínima (min)</Label>
                  <Input
                    id="minLead"
                    type="number"
                    min="15"
                    max="240"
                    className="mt-1 h-11 border-slate-300 bg-white text-slate-900"
                    value={scheduledConfig.minLeadMinutes}
                    onChange={(event) =>
                      updateScheduledConfig({ minLeadMinutes: Number(event.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="maxDays">Días máximos a futuro</Label>
                  <Input
                    id="maxDays"
                    type="number"
                    min="1"
                    max="7"
                    className="mt-1 h-11 border-slate-300 bg-white text-slate-900"
                    value={scheduledConfig.maxDaysAhead}
                    onChange={(event) =>
                      updateScheduledConfig({ maxDaysAhead: Number(event.target.value) })
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Mensajes al cliente</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div>
                  <Label htmlFor="received">Pedido recibido</Label>
                  <Input
                    id="received"
                    value={configuration.messages.orderReceived}
                    onChange={(event) =>
                      setConfiguration({
                        ...configuration,
                        messages: { ...configuration.messages, orderReceived: event.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="statusMessage">Cambio de estado</Label>
                  <Input
                    id="statusMessage"
                    value={configuration.messages.orderStatus}
                    onChange={(event) =>
                      setConfiguration({
                        ...configuration,
                        messages: { ...configuration.messages, orderStatus: event.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="unavailable">No disponible</Label>
                  <Input
                    id="unavailable"
                    value={configuration.messages.unavailable}
                    onChange={(event) =>
                      setConfiguration({
                        ...configuration,
                        messages: { ...configuration.messages, unavailable: event.target.value },
                      })
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <Button type="submit" disabled={saving} className="gap-2">
              <Save /> {saving ? "Guardando..." : "Guardar configuración"}
            </Button>
          </form>
        </PermissionGate>
      </div>
    </AdminGuard>
  );
}
