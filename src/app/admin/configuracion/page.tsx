"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { QrGeneratorCard } from "@/components/admin/QrGeneratorCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { DEFAULT_STORE_CONFIGURATION, type StoreConfiguration } from "@/types/operations";

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

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/configuration", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify(configuration),
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
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2">
            <RefreshCw className={loading ? "animate-spin" : ""} /> Actualizar
          </Button>
        </header>

        {message && (
          <p role="status" className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
            {message}
          </p>
        )}

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
                  <Label htmlFor="zones">Zonas de entrega, una por línea</Label>
                  <textarea
                    id="zones"
                    value={configuration.deliveryZones.join("\n")}
                    onChange={(event) =>
                      setConfiguration({
                        ...configuration,
                        deliveryZones: event.target.value
                          .split("\n")
                          .map((zone) => zone.trim())
                          .filter(Boolean),
                      })
                    }
                    className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                  <div key={hour.day} className="rounded-lg border p-3">
                    <p className="mb-2 text-sm font-semibold">{hour.day}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        aria-label={`${hour.day} apertura`}
                        type="time"
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
