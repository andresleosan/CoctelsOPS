"use client";

import { Flame, Plus, RefreshCw, Trash2, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import type { Promotion, PromotionDiscountType, PromotionType } from "@/types/promotions";

const DAYS_OF_WEEK = [
  { label: "Lun", value: 1 },
  { label: "Mar", value: 2 },
  { label: "Mié", value: 3 },
  { label: "Jue", value: 4 },
  { label: "Vie", value: 5 },
  { label: "Sáb", value: 6 },
  { label: "Dom", value: 0 },
];

const blankForm = {
  code: "",
  title: "",
  description: "",
  startsAt: "",
  endsAt: "",
  type: "standard" as PromotionType,
  discountType: "percent" as PromotionDiscountType,
  discountValue: "",
  minimumSubtotal: "0",
  maxDiscount: "",
  usageLimit: "",
  productIds: "",
  categoryIds: "",
  active: true,
  isAutomatic: false,
  // Horario Happy Hour
  scheduleEnabled: false,
  daysOfWeek: [5, 6] as number[], // Por defecto Viernes y Sábado
  startTime: "17:00",
  endTime: "20:00",
};

export default function PromotionsPage() {
  const { user } = useAuth();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [form, setForm] = useState(blankForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await fetch("/api/admin/promotions", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const body = (await response.json()) as { promotions?: Promotion[]; error?: string };
      if (!response.ok) throw new Error(body.error);
      setPromotions(body.promotions ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar las promociones.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Sincronización al montar y cuando el usuario autenticado cambia
  useEffect(() => {
    void load();
  }, [load]);

  function handleTypeChange(newType: PromotionType) {
    if (newType === "happy_hour") {
      setForm((prev) => ({
        ...prev,
        type: newType,
        scheduleEnabled: true,
        isAutomatic: true,
        discountType: prev.discountType === "fixed" ? "2x1" : prev.discountType,
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        type: newType,
        scheduleEnabled: false,
      }));
    }
  }

  function handleDayToggle(dayValue: number) {
    setForm((prev) => {
      const exists = prev.daysOfWeek.includes(dayValue);
      const updated = exists ? prev.daysOfWeek.filter((d) => d !== dayValue) : [...prev.daysOfWeek, dayValue];
      return { ...prev, daysOfWeek: updated };
    });
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    setError("");

    try {
      const payload: Record<string, unknown> = {
        code: form.code.trim().toUpperCase(),
        title: form.title.trim() || undefined,
        description: form.description.trim() || undefined,
        active: form.active,
        type: form.type,
        startsAt: `${form.startsAt}T00:00:00.000Z`,
        endsAt: `${form.endsAt}T23:59:59.999Z`,
        discountType: form.discountType,
        discountValue: form.discountType === "2x1" ? 0 : Number(form.discountValue || 0),
        minimumSubtotal: Number(form.minimumSubtotal || 0),
        maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : undefined,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
        productIds: form.productIds.split(",").map((v) => v.trim()).filter(Boolean),
        categoryIds: form.categoryIds.split(",").map((v) => v.trim()).filter(Boolean),
        isAutomatic: form.isAutomatic,
      };

      if (form.scheduleEnabled || form.type === "happy_hour") {
        if (form.daysOfWeek.length === 0) {
          throw new Error("Debe seleccionar al menos un día de la semana para el horario");
        }
        payload.schedule = {
          daysOfWeek: form.daysOfWeek,
          startTime: form.startTime,
          endTime: form.endTime,
          timezone: "America/Bogota",
        };
      }

      const response = await fetch("/api/admin/promotions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify(payload),
      });

      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Error al crear la promoción");

      setForm(blankForm);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar la promoción.");
    }
  }

  async function remove(id: string) {
    if (!user || !window.confirm("¿Eliminar esta promoción?")) return;
    const response = await fetch(`/api/admin/promotions?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    });
    if (!response.ok) setError("No se pudo eliminar la promoción.");
    else await load();
  }

  return (
    <AdminGuard permission="promociones.read">
      <div className="space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-600 dark:text-cyan-400">
              Ventas & Fidelización
            </p>
            <h1 className="mt-1 text-3xl font-black text-slate-900 dark:text-white">
              Promociones & Happy Hour
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Configura cupones estándar, combos y franjas horarias automáticas validadas en servidor.
            </p>
          </div>
          <Button variant="outline" onClick={() => void load()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Actualizar
          </Button>
        </header>

        {error && (
          <p role="alert" className="rounded-lg border border-red-500/30 bg-red-950/20 p-4 text-sm font-bold text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <PermissionGate permission="promociones.write">
          <Card className="border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <CardHeader>
              <CardTitle className="text-lg font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                <Flame className="h-5 w-5 text-pink-500" />
                Nueva Promoción / Happy Hour
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Tipo de Promoción */}
                <div>
                  <Label htmlFor="promoTypeKind" className="text-slate-700 dark:text-slate-300">Tipo de Promoción</Label>
                  <select
                    id="promoTypeKind"
                    value={form.type}
                    onChange={(e) => handleTypeChange(e.target.value as PromotionType)}
                    className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="standard">Cupón Estándar</option>
                    <option value="happy_hour">Happy Hour (Horario Automático)</option>
                    <option value="combo">Combo Especial</option>
                  </select>
                </div>

                {/* Código */}
                <div>
                  <Label htmlFor="promoCode" className="text-slate-700 dark:text-slate-300">Código</Label>
                  <Input
                    id="promoCode"
                    placeholder="Ej: HAPPY2X1"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    required
                    className="mt-1 uppercase font-mono"
                  />
                </div>

                {/* Título opcional */}
                <div className="sm:col-span-2">
                  <Label htmlFor="promoTitle" className="text-slate-700 dark:text-slate-300">Título Público (Visible al cliente)</Label>
                  <Input
                    id="promoTitle"
                    placeholder="Ej: ¡Happy Hour 2x1 en Granizados!"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="mt-1"
                  />
                </div>

                {/* Fecha Inicio y Fin */}
                <div>
                  <Label htmlFor="promoStart" className="text-slate-700 dark:text-slate-300">Fecha Inicio</Label>
                  <Input
                    id="promoStart"
                    type="date"
                    value={form.startsAt}
                    onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                    required
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="promoEnd" className="text-slate-700 dark:text-slate-300">Fecha Fin</Label>
                  <Input
                    id="promoEnd"
                    type="date"
                    value={form.endsAt}
                    onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                    required
                    className="mt-1"
                  />
                </div>

                {/* Tipo de Descuento */}
                <div>
                  <Label htmlFor="promoDiscountType" className="text-slate-700 dark:text-slate-300">Tipo de Descuento</Label>
                  <select
                    id="promoDiscountType"
                    value={form.discountType}
                    onChange={(e) => setForm({ ...form, discountType: e.target.value as PromotionDiscountType })}
                    className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="percent">Porcentaje (%)</option>
                    <option value="fixed">Valor Fijo ($ COP)</option>
                    <option value="2x1">2x1 (Paga 1 Lleva 2)</option>
                  </select>
                </div>

                {/* Valor del Descuento */}
                <div>
                  <Label htmlFor="promoValue" className="text-slate-700 dark:text-slate-300">
                    {form.discountType === "percent" ? "Porcentaje (%)" : form.discountType === "fixed" ? "Valor en COP" : "2x1 (Gratis el 2do)"}
                  </Label>
                  <Input
                    id="promoValue"
                    type="number"
                    min="0"
                    disabled={form.discountType === "2x1"}
                    placeholder={form.discountType === "2x1" ? "Automático (2x1)" : "0"}
                    value={form.discountType === "2x1" ? "" : form.discountValue}
                    onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                    required={form.discountType !== "2x1"}
                    className="mt-1"
                  />
                </div>

                {/* Compra mínima y Tope */}
                <div>
                  <Label htmlFor="promoMinimum" className="text-slate-700 dark:text-slate-300">Compra Mínima ($ COP)</Label>
                  <Input
                    id="promoMinimum"
                    type="number"
                    min="0"
                    value={form.minimumSubtotal}
                    onChange={(e) => setForm({ ...form, minimumSubtotal: e.target.value })}
                    required
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="promoCap" className="text-slate-700 dark:text-slate-300">Tope Máximo Descuento ($ COP)</Label>
                  <Input
                    id="promoCap"
                    type="number"
                    min="0"
                    placeholder="Sin tope"
                    value={form.maxDiscount}
                    onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="promoLimit" className="text-slate-700 dark:text-slate-300">Límite de Usos</Label>
                  <Input
                    id="promoLimit"
                    type="number"
                    min="1"
                    placeholder="Ilimitado"
                    value={form.usageLimit}
                    onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                    className="mt-1"
                  />
                </div>

                {/* Alcance por categorías */}
                <div className="sm:col-span-2">
                  <Label htmlFor="promoCategories" className="text-slate-700 dark:text-slate-300">
                    Categorías elegibles (ej. granizado, cocktail)
                  </Label>
                  <Input
                    id="promoCategories"
                    placeholder="granizado"
                    value={form.categoryIds}
                    onChange={(e) => setForm({ ...form, categoryIds: e.target.value })}
                    className="mt-1"
                  />
                </div>

                {/* Alcance por productos */}
                <div className="sm:col-span-2">
                  <Label htmlFor="promoProducts" className="text-slate-700 dark:text-slate-300">
                    Productos específicos (IDs separados por coma)
                  </Label>
                  <Input
                    id="promoProducts"
                    placeholder="Opcional: IDs específicos"
                    value={form.productIds}
                    onChange={(e) => setForm({ ...form, productIds: e.target.value })}
                    className="mt-1"
                  />
                </div>

                {/* Sección Franja Horaria (Happy Hour) */}
                <div className="sm:col-span-2 lg:col-span-4 rounded-xl border border-pink-500/30 bg-pink-950/10 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold flex items-center gap-2 text-pink-600 dark:text-pink-400">
                      <Flame className="h-4 w-4" /> Horario y Franja Happy Hour
                    </span>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.scheduleEnabled}
                        onChange={(e) => setForm({ ...form, scheduleEnabled: e.target.checked })}
                        className="rounded border-pink-500 text-pink-600 focus:ring-pink-500"
                      />
                      Activar Franja Horaria
                    </label>
                  </div>

                  {form.scheduleEnabled && (
                    <div className="grid gap-3 sm:grid-cols-2 pt-2">
                      <div>
                        <Label className="text-xs text-slate-600 dark:text-slate-400">Días aplicables</Label>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {DAYS_OF_WEEK.map((d) => {
                            const isSelected = form.daysOfWeek.includes(d.value);
                            return (
                              <button
                                key={d.value}
                                type="button"
                                onClick={() => handleDayToggle(d.value)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                  isSelected
                                    ? "bg-pink-600 text-white shadow-sm"
                                    : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                }`}
                              >
                                {d.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <Label htmlFor="startTime" className="text-xs text-slate-600 dark:text-slate-400">Hora Inicio</Label>
                          <Input
                            id="startTime"
                            type="time"
                            value={form.startTime}
                            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                        <div className="flex-1">
                          <Label htmlFor="endTime" className="text-xs text-slate-600 dark:text-slate-400">Hora Fin</Label>
                          <Input
                            id="endTime"
                            type="time"
                            value={form.endTime}
                            onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Flags adicionales */}
                <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-6 pt-1">
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => setForm({ ...form, active: e.target.checked })}
                      className="rounded border-slate-300"
                    />
                    Activa
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isAutomatic}
                      onChange={(e) => setForm({ ...form, isAutomatic: e.target.checked })}
                      className="rounded border-slate-300"
                    />
                    Aplicar automáticamente en checkout
                  </label>
                </div>

                <Button type="submit" className="sm:col-span-2 lg:col-span-4 lg:w-fit gap-2 bg-pink-600 hover:bg-pink-500 text-white font-bold">
                  <Plus className="h-4 w-4" /> Guardar Promoción
                </Button>
              </form>
            </CardContent>
          </Card>
        </PermissionGate>

        {/* Lista de Promociones Registradas */}
        <Card className="border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-slate-900 dark:text-white">
              Promociones Registradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-32 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            ) : promotions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                No hay promociones registradas en el sistema.
              </p>
            ) : (
              <div className="grid gap-3">
                {promotions.map((promotion) => (
                  <div
                    key={promotion.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-950"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="font-mono text-base font-bold text-slate-900 dark:text-white">
                          {promotion.code}
                        </strong>
                        <Badge variant={promotion.active ? "default" : "secondary"}>
                          {promotion.active ? "Activa" : "Inactiva"}
                        </Badge>
                        {promotion.type === "happy_hour" && (
                          <Badge className="bg-pink-500/20 text-pink-400 border border-pink-500/30 gap-1 font-bold">
                            <Flame className="h-3 w-3 fill-pink-400" /> Happy Hour
                          </Badge>
                        )}
                        {promotion.discountType === "2x1" && (
                          <Badge className="bg-purple-500/20 text-purple-400 border border-purple-500/30 font-bold">
                            2x1
                          </Badge>
                        )}
                        {promotion.isAutomatic && (
                          <Badge className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 gap-1 font-bold">
                            <Zap className="h-3 w-3" /> Auto
                          </Badge>
                        )}
                      </div>

                      {promotion.title && (
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {promotion.title}
                        </p>
                      )}

                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {promotion.discountType === "percent"
                          ? `${promotion.discountValue}% OFF`
                          : promotion.discountType === "2x1"
                          ? "2x1 (Segundo item gratis)"
                          : `$${promotion.discountValue.toLocaleString("es-CO")} COP OFF`}
                        {" · "}
                        Mínimo: ${promotion.minimumSubtotal.toLocaleString("es-CO")} COP
                        {" · "}
                        Usos: {promotion.usageCount}
                        {promotion.usageLimit ? `/${promotion.usageLimit}` : ""}
                      </p>

                      {promotion.schedule && (
                        <p className="text-xs font-mono text-pink-600 dark:text-pink-400">
                          Horario: {promotion.schedule.startTime} - {promotion.schedule.endTime} (Días:{" "}
                          {promotion.schedule.daysOfWeek
                            .map((d) => DAYS_OF_WEEK.find((day) => day.value === d)?.label ?? d)
                            .join(", ")}
                          )
                        </p>
                      )}

                      <p className="text-[11px] text-slate-500 dark:text-slate-500">
                        Alcance:{" "}
                        {promotion.productIds?.length
                          ? `Productos (${promotion.productIds.join(", ")})`
                          : promotion.categoryIds?.length
                          ? `Categorías (${promotion.categoryIds.join(", ")})`
                          : "Todos los productos de la carta"}
                      </p>
                    </div>

                    <PermissionGate permission="promociones.write">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => void remove(promotion.id)}
                        className="gap-1.5 shrink-0"
                      >
                        <Trash2 className="h-4 w-4" /> Eliminar
                      </Button>
                    </PermissionGate>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  );
}
