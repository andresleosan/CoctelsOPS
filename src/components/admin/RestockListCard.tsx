"use client";

import {
  AlertTriangle,
  Check,
  Copy,
  MessageCircle,
  PackageCheck,
  RefreshCw,
  ShoppingCart,
  Store,
  XCircle,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import {
  buildRestockList,
  buildWhatsAppShareUrl,
  formatSupplierWhatsAppMessage,
  type SupplierRestockGroup,
} from "@/lib/inventory/restock-list";
import type { SupplyItem } from "@/types/supplies";

function formatCop(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

export interface RestockListCardProps {
  initialSupplies?: SupplyItem[];
  storeName?: string;
}

export function RestockListCard({
  initialSupplies,
  storeName = "Coctels OPS",
}: RestockListCardProps) {
  const { user } = useAuth();
  const [supplies, setSupplies] = useState<SupplyItem[]>(initialSupplies ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetMultiplier, setTargetMultiplier] = useState<number>(2);
  const [customQuantities, setCustomQuantities] = useState<Record<string, number>>({});
  const [supplierPhones, setSupplierPhones] = useState<Record<string, string>>({});
  const [copiedSupplier, setCopiedSupplier] = useState<string | null>(null);

  const fetchSupplies = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/insumos", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { supplies?: SupplyItem[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Error al cargar insumos");
      setSupplies(data.supplies ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los insumos.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (initialSupplies) {
      setSupplies(initialSupplies);
      return;
    }
    void fetchSupplies();
  }, [initialSupplies, fetchSupplies]);

  const summary = useMemo(
    () => buildRestockList(supplies, { targetMultiplier }),
    [supplies, targetMultiplier]
  );

  // Recalcular costo total en vivo considerando cantidades editadas manualmente
  const liveTotalEstimatedCop = useMemo(() => {
    return summary.groups.reduce((total, group) => {
      const groupSum = group.items.reduce((gSum, item) => {
        const qty = customQuantities[item.supply.id] ?? item.suggestedQuantity;
        const unitCost = item.supply.costPerUnit > 0 ? item.supply.costPerUnit : 0;
        return gSum + Math.round(Math.max(0, qty) * unitCost);
      }, 0);
      return total + groupSum;
    }, 0);
  }, [summary.groups, customQuantities]);

  function handleMultiplierChange(multiplier: number) {
    setTargetMultiplier(multiplier);
    setCustomQuantities({});
  }

  function handleQuantityChange(supplyId: string, rawValue: string) {
    const parsed = Number(rawValue);
    if (Number.isNaN(parsed) || parsed < 0) return;
    setCustomQuantities((prev) => ({ ...prev, [supplyId]: parsed }));
  }

  function getGroupEstimatedCop(group: SupplierRestockGroup): number {
    return group.items.reduce((sum, item) => {
      const qty = customQuantities[item.supply.id] ?? item.suggestedQuantity;
      const unitCost = item.supply.costPerUnit > 0 ? item.supply.costPerUnit : 0;
      return sum + Math.round(Math.max(0, qty) * unitCost);
    }, 0);
  }

  async function handleCopyMessage(group: SupplierRestockGroup) {
    const message = formatSupplierWhatsAppMessage(group, {
      storeName,
      customQuantities,
    });
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(message);
    }
    setCopiedSupplier(group.supplier);
    setTimeout(() => setCopiedSupplier(null), 2000);
  }

  return (
    <div className="space-y-6">
      {/* Header / Resumen de Reposición */}
      <Card className="border-slate-800 bg-slate-900/90 p-4 sm:p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-cyan-400" />
              <h2 className="text-lg font-black tracking-tight text-white">
                Lista de Compras Automática
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-300">
              Insumos en semáforo Crítico o Bajo agrupados por proveedor para envío en 1 tap.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleMultiplierChange(2)}
              className={`min-h-[44px] border-slate-700 font-semibold ${
                targetMultiplier === 2
                  ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              2x Mínimo (Estándar)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleMultiplierChange(3)}
              className={`min-h-[44px] border-slate-700 font-semibold ${
                targetMultiplier === 3
                  ? "bg-pink-500/20 text-pink-300 border-pink-500/50"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              3x Mínimo (Pico)
            </Button>
            {!initialSupplies && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void fetchSupplies()}
                disabled={loading}
                className="min-h-[44px] border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
              >
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                Actualizar
              </Button>
            )}
          </div>
        </div>

        {/* KPIs de Reposición */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <span className="text-xs font-medium uppercase text-slate-400">Por Reponer</span>
            <p className="mt-1 text-2xl font-black text-white">{summary.totalItems}</p>
          </div>
          <div className="rounded-lg border border-rose-900/50 bg-rose-950/30 p-3">
            <span className="text-xs font-medium uppercase text-rose-300">Críticos</span>
            <p className="mt-1 text-2xl font-black text-rose-400">{summary.criticosCount}</p>
          </div>
          <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 p-3">
            <span className="text-xs font-medium uppercase text-amber-300">Stock Bajo</span>
            <p className="mt-1 text-2xl font-black text-amber-400">{summary.bajosCount}</p>
          </div>
          <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/30 p-3">
            <span className="text-xs font-medium uppercase text-emerald-300">Presupuesto Est.</span>
            <p className="mt-1 text-xl font-black text-emerald-400 truncate">
              {formatCop(liveTotalEstimatedCop)}
            </p>
          </div>
        </div>
      </Card>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-4 text-sm text-rose-200"
        >
          {error}
        </div>
      )}

      {loading && supplies.length === 0 ? (
        <div className="h-40 animate-pulse rounded-xl border border-slate-800 bg-slate-900/50" />
      ) : summary.groups.length === 0 ? (
        <Card className="border-slate-800 bg-slate-900/60 p-8 text-center text-white">
          <PackageCheck className="mx-auto h-10 w-10 text-emerald-400" />
          <h3 className="mt-3 text-base font-bold text-white">
            Todo el inventario está en niveles óptimos
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            No hay insumos en estado Crítico o Bajo en este momento.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {summary.groups.map((group) => {
            const groupEstimated = getGroupEstimatedCop(group);
            const message = formatSupplierWhatsAppMessage(group, {
              storeName,
              customQuantities,
            });
            const whatsappUrl = buildWhatsAppShareUrl(message, supplierPhones[group.supplier]);
            const isCopied = copiedSupplier === group.supplier;

            return (
              <Card
                key={group.supplier}
                className="overflow-hidden border-slate-800 bg-slate-900/80 text-white"
              >
                {/* Cabecera del Proveedor */}
                <div className="flex flex-col gap-3 border-b border-slate-800 bg-slate-950/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400">
                      <Store className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">{group.supplier}</h3>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                        <span>{group.items.length} insumo(s)</span>
                        {group.criticosCount > 0 && (
                          <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/40">
                            {group.criticosCount} crítico(s)
                          </Badge>
                        )}
                        {group.bajosCount > 0 && (
                          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40">
                            {group.bajosCount} bajo(s)
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="text-xs uppercase text-slate-400">Subtotal estimado</span>
                    <p className="text-lg font-black text-emerald-400">
                      {formatCop(groupEstimated)}
                    </p>
                  </div>
                </div>

                {/* Lista de Insumos a Comprar */}
                <div className="divide-y divide-slate-800/80">
                  {group.items.map((item) => {
                    const qty = customQuantities[item.supply.id] ?? item.suggestedQuantity;
                    const itemCost = Math.round(
                      Math.max(0, qty) * (item.supply.costPerUnit > 0 ? item.supply.costPerUnit : 0)
                    );

                    return (
                      <div
                        key={item.supply.id}
                        className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {item.priority === "critico" ? (
                              <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                            )}
                            <span className="font-semibold text-white truncate">
                              {item.supply.name}
                            </span>
                            <Badge
                              className={
                                item.priority === "critico"
                                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                  : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                              }
                            >
                              {item.priority === "critico" ? "Crítico" : "Bajo"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-slate-400">
                            Actual: <strong className="text-slate-200">{item.currentStock}</strong>{" "}
                            {item.supply.unit} · Mínimo:{" "}
                            <strong className="text-slate-200">{item.minStock}</strong>{" "}
                            {item.supply.unit} · Objetivo: {item.targetStock} {item.supply.unit}
                          </p>
                        </div>

                        <div className="flex items-center justify-between gap-3 sm:justify-end">
                          <div className="flex items-center gap-2">
                            <label
                              htmlFor={`qty-${item.supply.id}`}
                              className="text-xs font-medium text-slate-400"
                            >
                              Pedir ({item.supply.unit}):
                            </label>
                            <Input
                              id={`qty-${item.supply.id}`}
                              type="number"
                              min={0}
                              step={item.supply.unit === "l" || item.supply.unit === "kg" ? "0.5" : "1"}
                              value={qty}
                              onChange={(e) => handleQuantityChange(item.supply.id, e.target.value)}
                              aria-label={`Cantidad a pedir de ${item.supply.name}`}
                              className="min-h-[44px] w-24 border-slate-700 bg-slate-950 text-center font-bold text-white"
                            />
                          </div>

                          <div className="min-w-[90px] text-right">
                            <span className="text-xs text-slate-400 block">Costo est.</span>
                            <span className="text-sm font-bold text-emerald-400">
                              {formatCop(itemCost)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Acciones 1-Tap por WhatsApp */}
                <div className="flex flex-col gap-3 border-t border-slate-800 bg-slate-950/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1 sm:max-w-xs">
                    <Input
                      type="tel"
                      placeholder="Teléfono WhatsApp proveedor (opcional)"
                      aria-label={`Teléfono WhatsApp de ${group.supplier}`}
                      value={supplierPhones[group.supplier] ?? ""}
                      onChange={(e) =>
                        setSupplierPhones((prev) => ({
                          ...prev,
                          [group.supplier]: e.target.value,
                        }))
                      }
                      className="min-h-[44px] border-slate-700 bg-slate-900 text-sm text-white placeholder:text-slate-500"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleCopyMessage(group)}
                      className="min-h-[44px] border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                    >
                      {isCopied ? (
                        <>
                          <Check className="h-4 w-4 mr-1.5 text-emerald-400" />
                          Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-1.5" />
                          Copiar pedido
                        </>
                      )}
                    </Button>

                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-lg transition hover:bg-emerald-500"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Enviar por WhatsApp
                    </a>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
