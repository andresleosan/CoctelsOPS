"use client";

import {
  Banknote,
  Bike,
  Coins,
  Plus,
  Smartphone,
  Trash2,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

import { PermissionGate } from "@/components/admin/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  STAFF_TIP_ROLE_LABELS,
  TIP_DISTRIBUTION_MODE_LABELS,
  calculateStaffTipsDistribution,
  sumCashTips,
} from "@/lib/cash-register/calculator";
import { POS_DIGITAL_CHANNEL_LABELS, formatCop, sanitizeCopAmount } from "@/lib/orders/pos-calculator";
import {
  STAFF_TIP_ROLES,
  TIP_DISTRIBUTION_MODES,
  type CashTipEntry,
  type ShiftDriverDeliveryCount,
  type StaffTipRecipientInput,
  type StaffTipRole,
  type TipDistributionMode,
  type TipSource,
} from "@/types/cash-register";
import { POS_DIGITAL_CHANNELS, type PosDigitalChannel } from "@/types/orders";

export type StaffTipRecipientDraft = {
  id: string;
  name: string;
  role: StaffTipRole;
  deliveriesCount: string;
  commissionPerDeliveryCop: string;
  fixedCommissionCop: string;
  paidFromCash: boolean;
};

const QUICK_TIP_PRESETS = [2_000, 5_000, 10_000, 20_000] as const;

function formatTipDateTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function createEmptyStaffRecipientDraft(role: StaffTipRole = "bartender"): StaffTipRecipientDraft {
  return {
    id: `draft-${Math.random().toString(36).slice(2, 9)}`,
    name: "",
    role,
    deliveriesCount: "0",
    commissionPerDeliveryCop: role === "domiciliario" ? "4000" : "0",
    fixedCommissionCop: "0",
    paidFromCash: true,
  };
}

export function toStaffRecipientInputs(
  drafts: ReadonlyArray<StaffTipRecipientDraft>,
): StaffTipRecipientInput[] {
  return drafts
    .map((draft) => ({
      id: draft.id,
      name: draft.name.trim(),
      role: draft.role,
      deliveriesCount: Math.max(0, Math.round(Number(draft.deliveriesCount) || 0)),
      commissionPerDeliveryCop: sanitizeCopAmount(draft.commissionPerDeliveryCop),
      fixedCommissionCop: sanitizeCopAmount(draft.fixedCommissionCop),
      paidFromCash: draft.paidFromCash,
    }))
    .filter((item) => item.name.length >= 2);
}

type ShiftTipsTrackerCardProps = {
  tips: CashTipEntry[];
  submitting: boolean;
  onAddTip: (input: {
    amount: number;
    source: TipSource;
    channel?: PosDigitalChannel;
    notes?: string;
  }) => Promise<void> | void;
};

export function ShiftTipsTrackerCard({
  tips,
  submitting,
  onAddTip,
}: ShiftTipsTrackerCardProps) {
  const [source, setSource] = useState<TipSource>("efectivo");
  const [channel, setChannel] = useState<PosDigitalChannel>("nequi");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const totals = useMemo(() => sumCashTips(tips), [tips]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const cleanAmount = sanitizeCopAmount(amount);
    if (cleanAmount <= 0) return;

    await onAddTip({
      amount: cleanAmount,
      source,
      ...(source === "digital" ? { channel } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });

    setAmount("");
    setNotes("");
  }

  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
              <Coins className="h-5 w-5 text-amber-600" aria-hidden="true" />
              Propinas del Turno ({tips.length})
            </CardTitle>
            <CardDescription className="text-slate-600">
              Registra propinas en efectivo o por canal digital para liquidar al cierre.
            </CardDescription>
          </div>
          <Badge variant="outline" className="border-amber-300 bg-amber-50 font-bold text-amber-950">
            Total: {formatCop(totals.totalTipsCop)}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2 pt-1 text-xs font-semibold">
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800">
            <Banknote className="h-3.5 w-3.5" aria-hidden="true" />
            Efectivo: {formatCop(totals.cashTipsCop)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-cyan-800">
            <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
            Digital: {formatCop(totals.digitalTipsCop)}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <PermissionGate permission="pedidos.update">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={source === "efectivo" ? "default" : "outline"}
                onClick={() => setSource("efectivo")}
                className={`min-h-11 gap-1.5 text-xs font-semibold ${
                  source === "efectivo"
                    ? "bg-emerald-700 text-white hover:bg-emerald-800"
                    : "border-slate-300 bg-white text-slate-800"
                }`}
              >
                <Banknote className="h-4 w-4" aria-hidden="true" />
                Propina Efectivo
              </Button>
              <Button
                type="button"
                variant={source === "digital" ? "default" : "outline"}
                onClick={() => setSource("digital")}
                className={`min-h-11 gap-1.5 text-xs font-semibold ${
                  source === "digital"
                    ? "bg-cyan-700 text-white hover:bg-cyan-800"
                    : "border-slate-300 bg-white text-slate-800"
                }`}
              >
                <Smartphone className="h-4 w-4" aria-hidden="true" />
                Propina Digital
              </Button>
            </div>

            {source === "digital" && (
              <div className="flex flex-wrap gap-1.5">
                {POS_DIGITAL_CHANNELS.map((item) => (
                  <Button
                    key={item}
                    type="button"
                    size="sm"
                    variant={channel === item ? "default" : "outline"}
                    onClick={() => setChannel(item)}
                    className={`min-h-10 text-xs font-semibold ${
                      channel === item
                        ? "bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-800"
                    }`}
                  >
                    {POS_DIGITAL_CHANNEL_LABELS[item]}
                  </Button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              {QUICK_TIP_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setAmount(String(preset))}
                  className="min-h-10 border-slate-300 bg-white text-xs font-semibold text-slate-800"
                >
                  +{formatCop(preset)}
                </Button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tip-amount" className="text-slate-800">
                  Monto propina (COP) *
                </Label>
                <Input
                  id="tip-amount"
                  type="number"
                  min={100}
                  step={100}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Ej. 5000"
                  required
                  className="min-h-11 border-slate-300 bg-white text-slate-900"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tip-notes" className="text-slate-800">
                  Mesa / Nota (opcional)
                </Label>
                <Input
                  id="tip-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej. Mesa 4 o barra"
                  className="min-h-11 border-slate-300 bg-white text-slate-900"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={submitting || sanitizeCopAmount(amount) <= 0}
              className="min-h-11 w-full gap-2 bg-amber-600 font-semibold text-white hover:bg-amber-700"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {submitting ? "Guardando..." : "Registrar Propina"}
            </Button>
          </form>
        </PermissionGate>

        {tips.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">
            Aún no hay propinas registradas en este turno.
          </p>
        ) : (
          <ul className="space-y-2">
            {tips.map((tip) => (
              <li
                key={tip.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={
                        tip.source === "digital"
                          ? "border-cyan-300 bg-cyan-50 text-cyan-900"
                          : "border-emerald-300 bg-emerald-50 text-emerald-900"
                      }
                    >
                      {tip.source === "digital"
                        ? POS_DIGITAL_CHANNEL_LABELS[tip.channel ?? "transferencia"]
                        : "Efectivo"}
                    </Badge>
                    <span className="text-xs text-slate-600">
                      {formatTipDateTime(tip.createdAt)}
                      {tip.notes ? ` · ${tip.notes}` : ""}
                    </span>
                  </div>
                </div>
                <span className="shrink-0 font-bold text-amber-800">+{formatCop(tip.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

type CloseShiftStaffSettlementSectionProps = {
  enabled: boolean;
  onToggleEnabled: (value: boolean) => void;
  mode: TipDistributionMode;
  onChangeMode: (mode: TipDistributionMode) => void;
  extraCashTips: string;
  onChangeExtraCashTips: (value: string) => void;
  extraDigitalTips: string;
  onChangeExtraDigitalTips: (value: string) => void;
  recipients: StaffTipRecipientDraft[];
  onChangeRecipients: (next: StaffTipRecipientDraft[]) => void;
  recordedTips: CashTipEntry[];
  shiftDriverDeliveries: ShiftDriverDeliveryCount[];
};

export function CloseShiftStaffSettlementSection({
  enabled,
  onToggleEnabled,
  mode,
  onChangeMode,
  extraCashTips,
  onChangeExtraCashTips,
  extraDigitalTips,
  onChangeExtraDigitalTips,
  recipients,
  onChangeRecipients,
  recordedTips,
  shiftDriverDeliveries,
}: CloseShiftStaffSettlementSectionProps) {
  const recordedTotals = useMemo(() => sumCashTips(recordedTips), [recordedTips]);
  const totalCashTips = recordedTotals.cashTipsCop + sanitizeCopAmount(extraCashTips);
  const totalDigitalTips = recordedTotals.digitalTipsCop + sanitizeCopAmount(extraDigitalTips);

  const validInputs = useMemo(() => toStaffRecipientInputs(recipients), [recipients]);
  const preview = useMemo(
    () =>
      calculateStaffTipsDistribution({
        mode,
        cashTipsCop: totalCashTips,
        digitalTipsCop: totalDigitalTips,
        recipients: validInputs,
      }),
    [mode, totalCashTips, totalDigitalTips, validInputs],
  );

  function handleLoadDrivers() {
    const existingNames = new Set(
      recipients
        .filter((item) => item.role === "domiciliario")
        .map((item) => item.name.trim().toLowerCase()),
    );
    const additions: StaffTipRecipientDraft[] = shiftDriverDeliveries
      .filter((driver) => !existingNames.has(driver.name.trim().toLowerCase()))
      .map((driver) => ({
        id: `driver-${driver.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
        name: driver.name,
        role: "domiciliario" as const,
        deliveriesCount: String(driver.deliveriesCount),
        commissionPerDeliveryCop: "4000",
        fixedCommissionCop: "0",
        paidFromCash: true,
      }));
    if (additions.length > 0) {
      onChangeRecipients([...recipients, ...additions]);
    }
  }

  function updateRecipient(id: string, patch: Partial<StaffTipRecipientDraft>) {
    onChangeRecipients(
      recipients.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function removeRecipient(id: string) {
    onChangeRecipients(recipients.filter((item) => item.id !== id));
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Users className="h-4 w-4 text-[#E5196E]" aria-hidden="true" />
            Liquidación de Propinas y Comisiones de Staff
          </h3>
          <p className="text-xs text-slate-600">
            Distribuye el pote de propinas y comisiones por domicilio entre bartenders, meseros y domiciliarios.
          </p>
        </div>

        <Button
          type="button"
          size="sm"
          variant={enabled ? "default" : "outline"}
          onClick={() => onToggleEnabled(!enabled)}
          className={`min-h-11 text-xs font-semibold ${
            enabled
              ? "bg-slate-900 text-white hover:bg-slate-800"
              : "border-slate-300 bg-white text-slate-800"
          }`}
        >
          {enabled ? "Liquidación incluida en cierre" : "Incluir liquidación de staff"}
        </Button>
      </div>

      {enabled && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-2.5">
              <p className="text-[11px] font-medium text-slate-500">Propinas registradas turno</p>
              <p className="text-sm font-bold text-slate-900">
                {formatCop(recordedTotals.totalTipsCop)}
              </p>
              <p className="text-[11px] text-slate-500">
                Efec {formatCop(recordedTotals.cashTipsCop)} · Dig {formatCop(recordedTotals.digitalTipsCop)}
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="extra-cash-tips" className="text-xs font-semibold text-slate-800">
                Propina pote efectivo adicional (COP)
              </Label>
              <Input
                id="extra-cash-tips"
                type="number"
                min={0}
                step={500}
                value={extraCashTips}
                onChange={(e) => onChangeExtraCashTips(e.target.value)}
                placeholder="0"
                className="min-h-11 border-slate-300 bg-white text-slate-900"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="extra-digital-tips" className="text-xs font-semibold text-slate-800">
                Propina digital adicional (COP)
              </Label>
              <Input
                id="extra-digital-tips"
                type="number"
                min={0}
                step={500}
                value={extraDigitalTips}
                onChange={(e) => onChangeExtraDigitalTips(e.target.value)}
                placeholder="0"
                className="min-h-11 border-slate-300 bg-white text-slate-900"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-800">Modo de reparto</Label>
              <div className="flex flex-wrap gap-1.5">
                {TIP_DISTRIBUTION_MODES.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    size="sm"
                    variant={mode === option ? "default" : "outline"}
                    onClick={() => onChangeMode(option)}
                    className={`min-h-11 flex-1 text-xs font-semibold ${
                      mode === option
                        ? "bg-[#E5196E] text-white hover:bg-[#c8155f]"
                        : "border-slate-300 bg-white text-slate-800"
                    }`}
                  >
                    {TIP_DISTRIBUTION_MODE_LABELS[option]}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {STAFF_TIP_ROLES.map((role) => (
              <Button
                key={role}
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  onChangeRecipients([...recipients, createEmptyStaffRecipientDraft(role)])
                }
                className="min-h-11 gap-1.5 border-slate-300 bg-white text-xs font-semibold text-slate-800"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Agregar {STAFF_TIP_ROLE_LABELS[role]}
              </Button>
            ))}

            {shiftDriverDeliveries.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleLoadDrivers}
                className="min-h-11 gap-1.5 border-cyan-300 bg-cyan-50 text-xs font-semibold text-cyan-900 hover:bg-cyan-100"
              >
                <Bike className="h-4 w-4" aria-hidden="true" />
                Cargar domiciliarios del turno ({shiftDriverDeliveries.length})
              </Button>
            )}
          </div>

          {recipients.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500">
              Agrega los bartenders, meseros o domiciliarios del turno para calcular su liquidación.
            </p>
          ) : (
            <div className="space-y-2.5">
              {recipients.map((recipient, index) => (
                <div
                  key={recipient.id}
                  className="grid gap-2.5 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-12 sm:items-end"
                >
                  <div className="space-y-1 sm:col-span-3">
                    <Label htmlFor={`staff-name-${recipient.id}`} className="text-xs text-slate-700">
                      Integrante #{index + 1}
                    </Label>
                    <Input
                      id={`staff-name-${recipient.id}`}
                      value={recipient.name}
                      onChange={(e) => updateRecipient(recipient.id, { name: e.target.value })}
                      placeholder="Nombre completo"
                      className="min-h-11 border-slate-300 bg-white text-slate-900"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor={`staff-role-${recipient.id}`} className="text-xs text-slate-700">
                      Rol
                    </Label>
                    <select
                      id={`staff-role-${recipient.id}`}
                      value={recipient.role}
                      onChange={(e) =>
                        updateRecipient(recipient.id, { role: e.target.value as StaffTipRole })
                      }
                      className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm font-medium text-slate-900"
                    >
                      {STAFF_TIP_ROLES.map((roleOption) => (
                        <option key={roleOption} value={roleOption}>
                          {STAFF_TIP_ROLE_LABELS[roleOption]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor={`staff-deliveries-${recipient.id}`} className="text-xs text-slate-700">
                      Entregas
                    </Label>
                    <Input
                      id={`staff-deliveries-${recipient.id}`}
                      type="number"
                      min={0}
                      max={500}
                      value={recipient.deliveriesCount}
                      onChange={(e) =>
                        updateRecipient(recipient.id, { deliveriesCount: e.target.value })
                      }
                      className="min-h-11 border-slate-300 bg-white text-slate-900"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor={`staff-comm-del-${recipient.id}`} className="text-xs text-slate-700">
                      Comisión/entrega
                    </Label>
                    <Input
                      id={`staff-comm-del-${recipient.id}`}
                      type="number"
                      min={0}
                      step={500}
                      value={recipient.commissionPerDeliveryCop}
                      onChange={(e) =>
                        updateRecipient(recipient.id, {
                          commissionPerDeliveryCop: e.target.value,
                        })
                      }
                      className="min-h-11 border-slate-300 bg-white text-slate-900"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor={`staff-fixed-${recipient.id}`} className="text-xs text-slate-700">
                      Bono/Comisión fija
                    </Label>
                    <Input
                      id={`staff-fixed-${recipient.id}`}
                      type="number"
                      min={0}
                      step={500}
                      value={recipient.fixedCommissionCop}
                      onChange={(e) =>
                        updateRecipient(recipient.id, { fixedCommissionCop: e.target.value })
                      }
                      className="min-h-11 border-slate-300 bg-white text-slate-900"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
                    <label className="flex min-h-11 cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700 sm:hidden">
                      <input
                        type="checkbox"
                        checked={recipient.paidFromCash}
                        onChange={(e) =>
                          updateRecipient(recipient.id, { paidFromCash: e.target.checked })
                        }
                        className="h-4 w-4"
                      />
                      Sale de caja
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Quitar integrante ${recipient.name || index + 1}`}
                      onClick={() => removeRecipient(recipient.id)}
                      className="min-h-11 min-w-11 border-rose-200 text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="hidden sm:col-span-12 sm:flex sm:items-center sm:justify-between sm:border-t sm:border-slate-100 sm:pt-2">
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={recipient.paidFromCash}
                        onChange={(e) =>
                          updateRecipient(recipient.id, { paidFromCash: e.target.checked })
                        }
                        className="h-4 w-4"
                      />
                      Pagar este egreso desde la caja física (descuenta efectivo esperado)
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          {preview.allocations.length > 0 && (
            <div className="space-y-2 rounded-lg border border-cyan-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Vista previa de liquidación
                </span>
                <div className="flex flex-wrap gap-2 text-xs font-bold">
                  <span className="text-amber-800">
                    Propinas: {formatCop(preview.totalTipsCop)}
                  </span>
                  <span className="text-cyan-800">
                    Comisiones: {formatCop(preview.totalCommissionsCop)}
                  </span>
                  <span className="text-slate-900">
                    Total: {formatCop(preview.totalPayoutCop)}
                  </span>
                  <span className="text-rose-700">
                    Sale de caja: -{formatCop(preview.paidFromCashCop)}
                  </span>
                </div>
              </div>
              <ul className="space-y-1.5">
                {preview.allocations.map((allocation) => (
                  <li
                    key={allocation.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-800"
                  >
                    <span>
                      <strong>{allocation.name}</strong> ({STAFF_TIP_ROLE_LABELS[allocation.role]} ·{" "}
                      {allocation.sharePct}%)
                      {allocation.deliveriesCount > 0
                        ? ` · ${allocation.deliveriesCount} entregas`
                        : ""}
                    </span>
                    <span className="font-mono font-bold text-slate-950">
                      Propina {formatCop(allocation.tipShareCop)} + Com.{" "}
                      {formatCop(allocation.commissionCop)} = {formatCop(allocation.totalPayoutCop)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
