"use client";

import { ExternalLink, Pencil, Plus, RefreshCw, Store } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { DEFAULT_STORE_CONFIGURATION } from "@/types/operations";
import type { Negocio, NegocioInput, NegocioPlan } from "@/types/tenant";

type BusinessFormState = {
  slug: string;
  name: string;
  description: string;
  plan: NegocioPlan;
  active: boolean;
  whatsappNumber: string;
  deliveryZonesText: string;
  estimatedDeliveryMinutes: string;
  logoUrl: string;
  slogan: string;
  primaryColor: string;
  accentColor: string;
  ownerUid: string;
};

function createEmptyForm(ownerUid = ""): BusinessFormState {
  return {
    slug: "",
    name: "",
    description: "",
    plan: "pro",
    active: true,
    whatsappNumber: DEFAULT_STORE_CONFIGURATION.whatsappNumber,
    deliveryZonesText: DEFAULT_STORE_CONFIGURATION.deliveryZones.join(", "),
    estimatedDeliveryMinutes: String(DEFAULT_STORE_CONFIGURATION.estimatedDeliveryMinutes),
    logoUrl: "/catalog-placeholder.svg",
    slogan: "Granizados y cócteles artesanales al instante",
    primaryColor: "#E5196E",
    accentColor: "#00BCD4",
    ownerUid,
  };
}

function formFromNegocio(negocio: Negocio): BusinessFormState {
  return {
    slug: negocio.slug,
    name: negocio.name,
    description: negocio.description,
    plan: negocio.plan,
    active: negocio.active,
    whatsappNumber: negocio.configuracion.whatsappNumber,
    deliveryZonesText: negocio.configuracion.deliveryZones.join(", "),
    estimatedDeliveryMinutes: String(negocio.configuracion.estimatedDeliveryMinutes),
    logoUrl: negocio.branding.logoUrl,
    slogan: negocio.branding.slogan,
    primaryColor: negocio.branding.primaryColor ?? "#E5196E",
    accentColor: negocio.branding.accentColor ?? "#00BCD4",
    ownerUid: negocio.ownerUid,
  };
}

export default function NegociosAdminPage() {
  const { user } = useAuth();
  const [negocios, setNegocios] = useState<Negocio[]>([]);
  const [form, setForm] = useState<BusinessFormState>(() => createEmptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/negocios", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const body = (await response.json().catch(() => ({}))) as {
        negocios?: Negocio[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudieron cargar los locales.");
      }
      setNegocios(body.negocios ?? []);
      setForm((prev) => (prev.ownerUid ? prev : { ...prev, ownerUid: user.uid }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los locales.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(negocio: Negocio) {
    setEditingId(negocio.id);
    setForm(formFromNegocio(negocio));
    setError("");
    setNotice("");
  }

  function resetForm() {
    setEditingId(null);
    setForm(createEmptyForm(user?.uid ?? ""));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const deliveryZones = form.deliveryZonesText
        .split(",")
        .map((zone) => zone.trim())
        .filter(Boolean);

      const payload: NegocioInput = {
        slug: form.slug.trim().toLowerCase(),
        name: form.name.trim(),
        description: form.description.trim(),
        active: form.active,
        plan: form.plan,
        branding: {
          logoUrl: form.logoUrl.trim() || "/catalog-placeholder.svg",
          slogan: form.slogan.trim() || "Cócteles y granizados artesanales",
          primaryColor: form.primaryColor.trim() || "#E5196E",
          accentColor: form.accentColor.trim() || "#00BCD4",
        },
        configuracion: {
          whatsappNumber: form.whatsappNumber.replace(/\D/g, ""),
          businessHours: DEFAULT_STORE_CONFIGURATION.businessHours,
          deliveryZones: deliveryZones.length > 0 ? deliveryZones : ["Medellín"],
          estimatedDeliveryMinutes: Math.max(1, Number(form.estimatedDeliveryMinutes) || 35),
          messages: DEFAULT_STORE_CONFIGURATION.messages,
        },
        ownerUid: form.ownerUid.trim() || user.uid,
        staffUids: [],
      };

      const response = await fetch(
        editingId ? `/api/admin/negocios/${encodeURIComponent(editingId)}` : "/api/admin/negocios",
        {
          method: editingId ? "PATCH" : "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${await user.getIdToken()}`,
          },
          body: JSON.stringify(payload),
        },
      );
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "No se pudo guardar el local.");
      }

      setNotice(editingId ? "Local actualizado correctamente." : "Nuevo local creado correctamente.");
      resetForm();
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el local.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleNegocioActive(negocio: Negocio) {
    if (!user) return;
    setError("");
    try {
      const response = await fetch(`/api/admin/negocios/${encodeURIComponent(negocio.id)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ active: !negocio.active }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        negocio?: Negocio;
        error?: string;
      };
      if (!response.ok || !body.negocio) {
        throw new Error(body.error ?? "No se pudo cambiar el estado del local.");
      }
      setNegocios((prev) =>
        prev.map((item) => (item.id === negocio.id ? (body.negocio as Negocio) : item)),
      );
    } catch (toggleError) {
      setError(
        toggleError instanceof Error ? toggleError.message : "No se pudo actualizar el local.",
      );
    }
  }

  return (
    <AdminGuard permission="configuracion.read">
      <div className="space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">
              Multi-Tenant SaaS
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">Locales y Sedes</h1>
            <p className="mt-1 text-sm text-slate-600">
              Administra comercios independientes y sus tiendas públicas en{" "}
              <code className="font-mono text-xs">/m/[slug]</code>.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
            className="min-h-[44px] border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
          </Button>
        </header>

        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </p>
        )}

        {notice && (
          <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {notice}
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_26rem]">
          <div className="space-y-3">
            {loading ? (
              <div className="h-44 animate-pulse rounded-xl bg-white" />
            ) : negocios.length === 0 ? (
              <Card className="border-dashed border-slate-300 bg-white">
                <CardContent className="p-10 text-center text-sm text-slate-600">
                  Aún no hay locales registrados. Crea el primero desde el formulario.
                </CardContent>
              </Card>
            ) : (
              negocios.map((negocio) => (
                <Card key={negocio.id} className="border-slate-200 bg-white shadow-sm">
                  <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Store className="h-4 w-4 text-cyan-700" />
                        <h2 className="font-bold text-slate-900">{negocio.name}</h2>
                        <Badge
                          variant={negocio.active ? "default" : "secondary"}
                          className={
                            negocio.active
                              ? "bg-emerald-600 text-white hover:bg-emerald-600"
                              : "bg-slate-200 text-slate-700"
                          }
                        >
                          {negocio.active ? "Activo" : "Pausado"}
                        </Badge>
                        <Badge variant="outline" className="border-slate-300 bg-slate-50 uppercase text-slate-700">
                          {negocio.plan}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600">{negocio.description}</p>
                      <p className="text-xs text-slate-500">
                        Slug: <code className="font-mono text-slate-800">/m/{negocio.slug}</code> ·
                        WhatsApp: {negocio.configuracion.whatsappNumber}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="min-h-[40px] border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                      >
                        <Link href={`/m/${encodeURIComponent(negocio.slug)}`} target="_blank">
                          <ExternalLink className="h-4 w-4" /> Ver tienda
                        </Link>
                      </Button>
                      <PermissionGate permission="configuracion.write">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void toggleNegocioActive(negocio)}
                          className="min-h-[40px] border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                        >
                          {negocio.active ? "Pausar" : "Activar"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEdit(negocio)}
                          className="min-h-[40px] border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                        >
                          <Pencil className="h-4 w-4" /> Editar
                        </Button>
                      </PermissionGate>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <PermissionGate permission="configuracion.write">
            <Card className="h-fit border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base font-bold text-slate-900">
                  <span>{editingId ? "Editar local" : "Nuevo local SaaS"}</span>
                  {!editingId && <Plus className="h-4 w-4 text-cyan-700" />}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={(e) => void submit(e)} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="negocio-name" className="text-slate-800">
                      Nombre del local
                    </Label>
                    <Input
                      id="negocio-name"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Ej. Coctels OPS Poblado"
                      className="min-h-[44px] border-slate-300 bg-white text-slate-900"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="negocio-slug" className="text-slate-800">
                      Slug URL (/m/slug)
                    </Label>
                    <Input
                      id="negocio-slug"
                      value={form.slug}
                      onChange={(e) => setForm({ ...form, slug: e.target.value })}
                      placeholder="coctels-poblado"
                      className="min-h-[44px] border-slate-300 bg-white font-mono text-slate-900"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="negocio-description" className="text-slate-800">
                      Descripción
                    </Label>
                    <Input
                      id="negocio-description"
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Granizados y cócteles artesanales"
                      className="min-h-[44px] border-slate-300 bg-white text-slate-900"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="negocio-plan" className="text-slate-800">
                        Plan
                      </Label>
                      <select
                        id="negocio-plan"
                        value={form.plan}
                        onChange={(e) => setForm({ ...form, plan: e.target.value as NegocioPlan })}
                        className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                      >
                        <option value="starter">Starter</option>
                        <option value="pro">Pro</option>
                        <option value="enterprise">Enterprise</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="negocio-wa" className="text-slate-800">
                        WhatsApp (10-15 dígitos)
                      </Label>
                      <Input
                        id="negocio-wa"
                        value={form.whatsappNumber}
                        onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })}
                        placeholder="573001234567"
                        className="min-h-[44px] border-slate-300 bg-white text-slate-900"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="negocio-zones" className="text-slate-800">
                      Zonas de entrega (separadas por coma)
                    </Label>
                    <Input
                      id="negocio-zones"
                      value={form.deliveryZonesText}
                      onChange={(e) => setForm({ ...form, deliveryZonesText: e.target.value })}
                      className="min-h-[44px] border-slate-300 bg-white text-slate-900"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="negocio-primary" className="text-slate-800">
                        Color primario
                      </Label>
                      <Input
                        id="negocio-primary"
                        value={form.primaryColor}
                        onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                        className="min-h-[44px] border-slate-300 bg-white font-mono text-slate-900"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="negocio-accent" className="text-slate-800">
                        Color acento
                      </Label>
                      <Input
                        id="negocio-accent"
                        value={form.accentColor}
                        onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                        className="min-h-[44px] border-slate-300 bg-white font-mono text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="negocio-owner" className="text-slate-800">
                      UID del propietario
                    </Label>
                    <Input
                      id="negocio-owner"
                      value={form.ownerUid}
                      onChange={(e) => setForm({ ...form, ownerUid: e.target.value })}
                      className="min-h-[44px] border-slate-300 bg-white font-mono text-xs text-slate-900"
                      required
                    />
                  </div>

                  <label className="flex min-h-[40px] cursor-pointer items-center gap-2 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => setForm({ ...form, active: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Local activo en storefront
                  </label>

                  <div className="flex gap-2">
                    <Button type="submit" disabled={saving} className="min-h-[44px] flex-1">
                      {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear local"}
                    </Button>
                    {editingId && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={resetForm}
                        className="min-h-[44px] border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                      >
                        Cancelar
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          </PermissionGate>
        </div>
      </div>
    </AdminGuard>
  );
}
