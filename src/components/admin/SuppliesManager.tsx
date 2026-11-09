"use client";

import { AlertTriangle, DollarSign, Filter, Package, Plus, RefreshCw, Search, XCircle } from "lucide-react";
import React, { useId, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import type {
  SuppliesKpis,
  SupplyCategory,
  SupplyItem,
  SupplyMovementType,
  SupplyStatus,
  SupplyUnit,
} from "@/types/supplies";

const CATEGORIES: { label: string; value: SupplyCategory | "todas" }[] = [
  { label: "Todas", value: "todas" },
  { label: "Licores", value: "licor" },
  { label: "Pulpas", value: "pulpa" },
  { label: "Mezcladores", value: "mezclador" },
  { label: "Desechables", value: "desechable" },
  { label: "Toppings", value: "topping" },
  { label: "Otros", value: "otro" },
];

const STATUS_FILTERS: { label: string; value: SupplyStatus | "todos" }[] = [
  { label: "Todos", value: "todos" },
  { label: "Críticos", value: "critico" },
  { label: "Stock Bajo", value: "bajo" },
  { label: "En Stock (OK)", value: "ok" },
];

function formatCop(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

interface SuppliesManagerProps {
  initialSupplies?: SupplyItem[];
  initialKpis?: SuppliesKpis;
  canEdit?: boolean;
}

export function SuppliesManager({
  initialSupplies = [],
  initialKpis,
  canEdit = true,
}: SuppliesManagerProps) {
  const { user } = useAuth();
  const searchInputId = useId();
  const newNameId = useId();
  const newCatId = useId();
  const newUnitId = useId();
  const newStockId = useId();
  const newMinStockId = useId();
  const newCostId = useId();
  const newSupplierId = useId();
  const moveTypeId = useId();
  const moveQtyId = useId();
  const moveReasonId = useId();

  const [supplies, setSupplies] = useState<SupplyItem[]>(initialSupplies);
  const [kpis, setKpis] = useState<SuppliesKpis>(
    initialKpis ?? { total: 0, criticos: 0, bajos: 0, ok: 0, valorTotalCop: 0 }
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<SupplyCategory | "todas">("todas");
  const [selectedStatus, setSelectedStatus] = useState<SupplyStatus | "todos">("todos");

  // Quick movement dialog state
  const [activeItemForMovement, setActiveItemForMovement] = useState<SupplyItem | null>(null);
  const [movementType, setMovementType] = useState<SupplyMovementType>("entrada");
  const [movementQuantity, setMovementQuantity] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [savingMovement, setSavingMovement] = useState(false);

  // New supply dialog state
  const [showNewModal, setShowNewModal] = useState(false);
  const [newSupply, setNewSupply] = useState({
    name: "",
    category: "licor" as SupplyCategory,
    unit: "botella" as SupplyUnit,
    currentStock: "",
    minStock: "",
    costPerUnit: "",
    supplier: "",
  });
  const [savingNew, setSavingNew] = useState(false);

  async function fetchSupplies() {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/insumos", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cargar insumos");
      setSupplies(data.supplies || []);
      setKpis(data.kpis || { total: 0, criticos: 0, bajos: 0, ok: 0, valorTotalCop: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al conectar con el servidor");
    } finally {
      setLoading(false);
    }
  }

  // Filter supplies based on category, status, and search query
  const filteredSupplies = supplies.filter((item) => {
    if (selectedCategory !== "todas" && item.category !== selectedCategory) return false;
    if (selectedStatus !== "todos" && item.status !== selectedStatus) return false;
    if (search.trim()) {
      const query = search.toLowerCase();
      const matchesName = item.name.toLowerCase().includes(query);
      const matchesCategory = item.category.toLowerCase().includes(query);
      const matchesSupplier = item.supplier?.toLowerCase().includes(query);
      if (!matchesName && !matchesCategory && !matchesSupplier) return false;
    }
    return true;
  });

  async function handleRecordMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!activeItemForMovement || !user) return;
    const qty = Number(movementQuantity);
    if (isNaN(qty) || qty <= 0) {
      alert("Ingresa una cantidad válida mayor a 0");
      return;
    }
    if (!movementReason.trim()) {
      alert("Ingresa el motivo del movimiento");
      return;
    }

    setSavingMovement(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/insumos/${activeItemForMovement.id}/movimiento`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: movementType,
          quantity: qty,
          reason: movementReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo registrar el movimiento");

      // Update state locally
      if (data.supply) {
        setSupplies((prev) =>
          prev.map((s) => (s.id === data.supply.id ? data.supply : s))
        );
      }
      setActiveItemForMovement(null);
      setMovementQuantity("");
      setMovementReason("");
      void fetchSupplies();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al registrar movimiento");
    } finally {
      setSavingMovement(false);
    }
  }

  async function handleCreateSupply(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!newSupply.name.trim()) {
      alert("El nombre del insumo es obligatorio");
      return;
    }

    setSavingNew(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/insumos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newSupply.name.trim(),
          category: newSupply.category,
          unit: newSupply.unit,
          currentStock: Number(newSupply.currentStock || 0),
          minStock: Number(newSupply.minStock || 0),
          costPerUnit: Number(newSupply.costPerUnit || 0),
          supplier: newSupply.supplier.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear insumo");

      setShowNewModal(false);
      setNewSupply({
        name: "",
        category: "licor",
        unit: "botella",
        currentStock: "",
        minStock: "",
        costPerUnit: "",
        supplier: "",
      });
      void fetchSupplies();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al crear insumo");
    } finally {
      setSavingNew(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Resumen KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-slate-800 bg-slate-900/60 p-4 backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase text-slate-400">Total Insumos</span>
            <Package className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-white">{kpis.total}</p>
          <span className="text-xs text-slate-400">En catálogo de barra</span>
        </Card>

        <Card className="border-rose-900/50 bg-rose-950/20 p-4 backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase text-rose-300">Críticos / Agotados</span>
            <XCircle className="h-4 w-4 text-rose-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-rose-400">{kpis.criticos}</p>
          <span className="text-xs text-rose-300/80">Stock en 0 o negativo</span>
        </Card>

        <Card className="border-amber-900/50 bg-amber-950/20 p-4 backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase text-amber-300">Stock Bajo</span>
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-amber-400">{kpis.bajos}</p>
          <span className="text-xs text-amber-300/80">Por debajo del mínimo</span>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 p-4 backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase text-slate-400">Valor Estimado</span>
            <DollarSign className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-xl font-bold text-emerald-400 truncate">
            {formatCop(kpis.valorTotalCop)}
          </p>
          <span className="text-xs text-slate-400">En existencia actual</span>
        </Card>
      </div>

      {/* Controles de barra: Búsqueda, Filtros y Nuevo Insumo */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id={searchInputId}
              placeholder="Buscar insumo (ej. Ron, Maracuyá, Vaso 16 oz)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-[44px] bg-slate-950/70 pl-9 text-white placeholder:text-slate-500 border-slate-700"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchSupplies()}
              disabled={loading}
              className="min-h-[44px] border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>

            {canEdit && (
              <Button
                size="sm"
                onClick={() => setShowNewModal(true)}
                className="min-h-[44px] bg-gradient-to-r from-pink-600 to-purple-600 text-white font-semibold shadow-lg hover:from-pink-500 hover:to-purple-500"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Nuevo Insumo
              </Button>
            )}
          </div>
        </div>

        {/* Chips de Categorías */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <Filter className="h-3.5 w-3.5 text-slate-400 mr-1 shrink-0" />
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setSelectedCategory(cat.value)}
              className={`min-h-[36px] rounded-full px-3 py-1.5 font-medium transition-all shrink-0 ${
                selectedCategory === cat.value
                  ? "bg-cyan-500 text-slate-950 font-bold shadow-cyan-500/20 shadow-md"
                  : "bg-slate-800/80 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Chips de Estado */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          <span className="text-slate-400 mr-1 shrink-0">Estado:</span>
          {STATUS_FILTERS.map((st) => (
            <button
              key={st.value}
              type="button"
              onClick={() => setSelectedStatus(st.value)}
              className={`min-h-[32px] rounded-full px-2.5 py-1 transition-all shrink-0 ${
                selectedStatus === st.value
                  ? "bg-slate-200 text-slate-950 font-bold"
                  : "bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-800 bg-rose-950/30 p-4 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Lista de Insumos (Mobile Cards & Desktop Grid) */}
      {loading && supplies.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-40 animate-pulse rounded-xl bg-slate-900/60 border border-slate-800" />
          ))}
        </div>
      ) : filteredSupplies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-800 p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-slate-600" />
          <h3 className="mt-3 text-lg font-bold text-white">No se encontraron insumos</h3>
          <p className="mt-1 text-sm text-slate-400">
            {search || selectedCategory !== "todas" || selectedStatus !== "todos"
              ? "Prueba cambiando los filtros o la búsqueda."
              : "Registra tu primer insumo de barra con el botón 'Nuevo Insumo'."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredSupplies.map((item) => {
            const isCritical = item.status === "critico";
            const isLow = item.status === "bajo";

            return (
              <Card
                key={item.id}
                className={`relative flex flex-col justify-between overflow-hidden border transition-all ${
                  isCritical
                    ? "border-rose-600/60 bg-rose-950/15"
                    : isLow
                    ? "border-amber-600/50 bg-amber-950/15"
                    : "border-slate-800 bg-slate-900/40"
                }`}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                          {item.category}
                        </span>
                        {item.supplier && (
                          <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                            • {item.supplier}
                          </span>
                        )}
                      </div>
                      <CardTitle className="mt-1 text-base font-bold text-white">
                        {item.name}
                      </CardTitle>
                    </div>

                    <Badge
                      className={`text-[11px] font-bold px-2 py-0.5 border ${
                        isCritical
                          ? "bg-rose-500/20 text-rose-300 border-rose-500/50"
                          : isLow
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                          : "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
                      }`}
                    >
                      {isCritical ? "Crítico" : isLow ? "Bajo" : "OK"}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="p-4 pt-2">
                  <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-slate-950/60 p-2.5 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Stock Actual</span>
                      <span className="text-base font-black text-white">
                        {item.currentStock} <span className="text-xs font-normal text-slate-400">{item.unit}</span>
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[11px]">Mínimo Requerido</span>
                      <span className="text-base font-bold text-slate-300">
                        {item.minStock} <span className="text-xs font-normal text-slate-400">{item.unit}</span>
                      </span>
                    </div>

                    {item.costPerUnit > 0 && (
                      <div className="col-span-2 mt-1 border-t border-slate-800/80 pt-1 flex justify-between items-center">
                        <span className="text-[11px] text-slate-400">Costo Unitario:</span>
                        <span className="font-semibold text-slate-200">{formatCop(item.costPerUnit)}</span>
                      </div>
                    )}
                  </div>

                  {/* Acciones de Barra Móvil en 1-Tap */}
                  {canEdit && (
                    <div className="mt-3 flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setActiveItemForMovement(item);
                          setMovementType("entrada");
                          setMovementReason("Compra / Reposición");
                        }}
                        className="flex-1 min-h-[40px] border-emerald-600/40 bg-emerald-950/20 text-emerald-300 hover:bg-emerald-900/30 text-xs font-semibold"
                      >
                        + Entrada
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setActiveItemForMovement(item);
                          setMovementType("merma");
                          setMovementReason("Merma / Desperdicio");
                        }}
                        className="flex-1 min-h-[40px] border-rose-600/40 bg-rose-950/20 text-rose-300 hover:bg-rose-900/30 text-xs font-semibold"
                      >
                        - Merma
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setActiveItemForMovement(item);
                          setMovementType("ajuste");
                          setMovementReason("Conteo físico de barra");
                          setMovementQuantity(String(item.currentStock));
                        }}
                        className="min-h-[40px] text-slate-400 hover:text-white text-xs px-2"
                      >
                        Ajuste
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal / Dialog de Registro Rápido de Movimiento */}
      {activeItemForMovement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-black text-white">
              Registrar Movimiento en {activeItemForMovement.name}
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Stock actual: <strong className="text-white">{activeItemForMovement.currentStock} {activeItemForMovement.unit}</strong>
            </p>

            <form onSubmit={handleRecordMovement} className="mt-4 space-y-4">
              <div>
                <Label htmlFor={moveTypeId} className="text-xs text-slate-300">Tipo de Movimiento</Label>
                <select
                  id={moveTypeId}
                  value={movementType}
                  onChange={(e) => setMovementType(e.target.value as SupplyMovementType)}
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white"
                >
                  <option value="entrada">+ Entrada (Suma al stock)</option>
                  <option value="merma">- Merma / Pérdida (Resta al stock)</option>
                  <option value="ajuste">= Ajuste Físico (Fijar conteo exacto)</option>
                  <option value="consumo">- Consumo Operativo</option>
                </select>
              </div>

              <div>
                <Label htmlFor={moveQtyId} className="text-xs text-slate-300">
                  {movementType === "ajuste"
                    ? `Nuevo Stock Conteo (${activeItemForMovement.unit})`
                    : `Cantidad a ${movementType === "entrada" ? "sumar" : "restar"} (${activeItemForMovement.unit})`}
                </Label>
                <Input
                  id={moveQtyId}
                  type="number"
                  step="any"
                  placeholder="Ej. 5"
                  value={movementQuantity}
                  onChange={(e) => setMovementQuantity(e.target.value)}
                  required
                  className="mt-1 min-h-[44px] bg-slate-950 border-slate-700 text-white"
                />
              </div>

              <div>
                <Label htmlFor={moveReasonId} className="text-xs text-slate-300">Motivo</Label>
                <Input
                  id={moveReasonId}
                  placeholder="Ej. Reposición semanal de Ron / Botella rota"
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  required
                  className="mt-1 min-h-[44px] bg-slate-950 border-slate-700 text-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveItemForMovement(null)}
                  disabled={savingMovement}
                  className="flex-1 min-h-[44px] border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={savingMovement}
                  className="flex-1 min-h-[44px] bg-cyan-600 font-bold text-white hover:bg-cyan-500"
                >
                  {savingMovement ? "Guardando..." : "Confirmar"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal / Dialog de Creación de Nuevo Insumo */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl my-8">
            <h3 className="text-xl font-black text-white">Nuevo Insumo de Barra</h3>
            <p className="mt-1 text-xs text-slate-400">
              Registra materia prima, pulpas, licores o desechables para control de stock.
            </p>

            <form onSubmit={handleCreateSupply} className="mt-4 space-y-4">
              <div>
                <Label htmlFor={newNameId} className="text-xs text-slate-300">Nombre del Insumo</Label>
                <Input
                  id={newNameId}
                  placeholder="Ej. Ron Medellín Añejo 3 Años 750ml"
                  value={newSupply.name}
                  onChange={(e) => setNewSupply({ ...newSupply, name: e.target.value })}
                  required
                  className="mt-1 min-h-[44px] bg-slate-950 border-slate-700 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor={newCatId} className="text-xs text-slate-300">Categoría</Label>
                  <select
                    id={newCatId}
                    value={newSupply.category}
                    onChange={(e) => setNewSupply({ ...newSupply, category: e.target.value as SupplyCategory })}
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white"
                  >
                    <option value="licor">Licor</option>
                    <option value="pulpa">Pulpa / Fruta</option>
                    <option value="mezclador">Mezclador / Jarabe</option>
                    <option value="desechable">Desechable (Vasos, etc.)</option>
                    <option value="topping">Topping / Adición</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor={newUnitId} className="text-xs text-slate-300">Unidad de Medida</Label>
                  <select
                    id={newUnitId}
                    value={newSupply.unit}
                    onChange={(e) => setNewSupply({ ...newSupply, unit: e.target.value as SupplyUnit })}
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white"
                  >
                    <option value="botella">Botella</option>
                    <option value="unidad">Unidad</option>
                    <option value="ml">Mililitros (ml)</option>
                    <option value="l">Litros (l)</option>
                    <option value="g">Gramos (g)</option>
                    <option value="kg">Kilos (kg)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor={newStockId} className="text-xs text-slate-300">Stock Inicial</Label>
                  <Input
                    id={newStockId}
                    type="number"
                    step="any"
                    placeholder="0"
                    value={newSupply.currentStock}
                    onChange={(e) => setNewSupply({ ...newSupply, currentStock: e.target.value })}
                    required
                    className="mt-1 min-h-[44px] bg-slate-950 border-slate-700 text-white"
                  />
                </div>

                <div>
                  <Label htmlFor={newMinStockId} className="text-xs text-slate-300">Stock Mínimo (Alerta)</Label>
                  <Input
                    id={newMinStockId}
                    type="number"
                    step="any"
                    placeholder="2"
                    value={newSupply.minStock}
                    onChange={(e) => setNewSupply({ ...newSupply, minStock: e.target.value })}
                    required
                    className="mt-1 min-h-[44px] bg-slate-950 border-slate-700 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor={newCostId} className="text-xs text-slate-300">Costo Unitario (COP)</Label>
                  <Input
                    id={newCostId}
                    type="number"
                    placeholder="35000"
                    value={newSupply.costPerUnit}
                    onChange={(e) => setNewSupply({ ...newSupply, costPerUnit: e.target.value })}
                    className="mt-1 min-h-[44px] bg-slate-950 border-slate-700 text-white"
                  />
                </div>

                <div>
                  <Label htmlFor={newSupplierId} className="text-xs text-slate-300">Proveedor (Opcional)</Label>
                  <Input
                    id={newSupplierId}
                    placeholder="Ej. FLA / Dislicores"
                    value={newSupply.supplier}
                    onChange={(e) => setNewSupply({ ...newSupply, supplier: e.target.value })}
                    className="mt-1 min-h-[44px] bg-slate-950 border-slate-700 text-white"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowNewModal(false)}
                  disabled={savingNew}
                  className="flex-1 min-h-[44px] border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={savingNew}
                  className="flex-1 min-h-[44px] bg-gradient-to-r from-pink-600 to-purple-600 font-bold text-white hover:from-pink-500 hover:to-purple-500"
                >
                  {savingNew ? "Guardando..." : "Crear Insumo"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
