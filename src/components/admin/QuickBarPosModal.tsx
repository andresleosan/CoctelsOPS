"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  GlassWater,
  Minus,
  Plus,
  Printer,
  QrCode,
  Search,
  SlidersHorizontal,
  Smartphone,
  Split,
  Trash2,
  UtensilsCrossed,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getProductSizes } from "@/lib/catalog/presentations";
import {
  POS_DIGITAL_CHANNEL_LABELS,
  balanceMixedPaymentAmounts,
  buildPosOrderPayload,
  calculatePosCartTotal,
  calculatePosPayment,
  createPosCartItem,
  formatCop,
  getPosProductDefaultSize,
  getQuickCashDenominations,
  sanitizeCopAmount,
  type PosCartItem,
  type PosOrderPreview,
} from "@/lib/orders/pos-calculator";
import type { Product } from "@/types/catalog";
import type {
  CreateOrderInput,
  Order,
  PosDigitalChannel,
  PosPaymentMethod,
} from "@/types/orders";

export type PosOrderSubmitResult = {
  ok: boolean;
  synced?: boolean;
  order?: Order;
  error?: string;
};

export type QuickBarPosModalProps = {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  loadingProducts?: boolean;
  isOnline: boolean;
  onSubmitPosOrder: (
    payload: CreateOrderInput,
    preview: PosOrderPreview,
  ) => Promise<PosOrderSubmitResult>;
  onPrintOrder?: (order: Order) => void;
};

const QUICK_TABLES = ["1", "2", "3", "4", "5", "6"] as const;
const DIGITAL_CHANNELS: readonly PosDigitalChannel[] = ["nequi", "daviplata", "qr"];

const PAYMENT_METHOD_OPTIONS: ReadonlyArray<{
  id: PosPaymentMethod;
  label: string;
  icon: typeof Banknote;
}> = [
  { id: "efectivo", label: "Efectivo", icon: Banknote },
  { id: "nequi", label: "Nequi", icon: Smartphone },
  { id: "daviplata", label: "Daviplata", icon: Smartphone },
  { id: "qr", label: "Código QR", icon: QrCode },
  { id: "mixto", label: "Cobro Mixto", icon: Split },
];

export function QuickBarPosModal({
  isOpen,
  onClose,
  products,
  loadingProducts = false,
  isOnline,
  onSubmitPosOrder,
  onPrintOrder,
}: QuickBarPosModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [cartItems, setCartItems] = useState<PosCartItem[]>([]);
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [customSize, setCustomSize] = useState<string>("");
  const [customFlavors, setCustomFlavors] = useState<string[]>([]);
  const [customAddOns, setCustomAddOns] = useState<string[]>([]);

  const [serviceType, setServiceType] = useState<"pickup" | "mesa">("pickup");
  const [tableNumber, setTableNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");

  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>("efectivo");
  const [cashReceived, setCashReceived] = useState<number>(0);
  const [cashTouched, setCashTouched] = useState(false);
  const [mixedDigitalChannel, setMixedDigitalChannel] = useState<PosDigitalChannel>("nequi");
  const [mixedDigitalAmount, setMixedDigitalAmount] = useState<number>(0);
  const [mixedCashAmount, setMixedCashAmount] = useState<number>(0);
  const [digitalReference, setDigitalReference] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [lastSubmitted, setLastSubmitted] = useState<{
    synced: boolean;
    summary: string;
    changeAmount: number;
    order?: Order;
  } | null>(null);

  const activeProducts = useMemo(
    () => products.filter((product) => product.active !== false),
    [products],
  );

  const categories = useMemo(() => {
    const unique = new Set<string>();
    for (const product of activeProducts) {
      if (product.category) unique.add(product.category);
    }
    return ["all", ...Array.from(unique)];
  }, [activeProducts]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase();
    return activeProducts.filter((product) => {
      const matchesCategory =
        selectedCategory === "all" || product.category === selectedCategory;
      const matchesQuery =
        !q ||
        product.name.toLocaleLowerCase().includes(q) ||
        product.category.toLocaleLowerCase().includes(q) ||
        product.availableFlavors.some((flavor) => flavor.toLocaleLowerCase().includes(q));
      return matchesCategory && matchesQuery;
    });
  }, [activeProducts, searchQuery, selectedCategory]);

  const cartTotal = useMemo(() => calculatePosCartTotal(cartItems), [cartItems]);
  const totalUnits = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems],
  );

  // Synchronize default tendered / split amounts when cart total changes
  useEffect(() => {
    if (paymentMethod === "efectivo" && !cashTouched) {
      setCashReceived(cartTotal);
    }
    if (paymentMethod === "mixto") {
      if (cartTotal === 0) {
        setMixedDigitalAmount(0);
        setMixedCashAmount(0);
        setCashReceived(0);
      } else if (mixedDigitalAmount + mixedCashAmount !== cartTotal) {
        const halfDigital = Math.floor(cartTotal / 2);
        const remainingCash = cartTotal - halfDigital;
        setMixedDigitalAmount(halfDigital);
        setMixedCashAmount(remainingCash);
        setCashReceived(remainingCash);
        setCashTouched(false);
      }
    }
  }, [cartTotal, paymentMethod, cashTouched, mixedDigitalAmount, mixedCashAmount]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const paymentCalculation = useMemo(
    () =>
      calculatePosPayment({
        total: cartTotal,
        method: paymentMethod,
        cashAmount: paymentMethod === "mixto" ? mixedCashAmount : undefined,
        cashReceived:
          paymentMethod === "efectivo" || paymentMethod === "mixto"
            ? cashReceived
            : undefined,
        digitalAmount: paymentMethod === "mixto" ? mixedDigitalAmount : undefined,
        digitalMethod: paymentMethod === "mixto" ? mixedDigitalChannel : undefined,
        digitalReference,
      }),
    [
      cartTotal,
      paymentMethod,
      mixedCashAmount,
      cashReceived,
      mixedDigitalAmount,
      mixedDigitalChannel,
      digitalReference,
    ],
  );

  const quickCashBills = useMemo(
    () =>
      getQuickCashDenominations(
        paymentMethod === "mixto" ? mixedCashAmount : cartTotal,
      ),
    [paymentMethod, mixedCashAmount, cartTotal],
  );

  if (!isOpen) return null;

  function getAllocatedStockForProduct(productId: string): number {
    return cartItems
      .filter((item) => item.productId === productId)
      .reduce((sum, item) => sum + item.quantity, 0);
  }

  function addItemToTicket(
    product: Product,
    customization?: { size: string; flavors: string[]; addOns: string[] },
  ) {
    setSubmitError("");
    const currentAllocated = getAllocatedStockForProduct(product.id);
    if (product.stock <= 0 || currentAllocated >= product.stock) {
      setSubmitError(`Stock máximo alcanzado para ${product.name} (${product.stock} disp.).`);
      return;
    }

    const newItem = createPosCartItem(product, customization, 1);
    setCartItems((prev) => {
      const existingIndex = prev.findIndex((line) => line.lineKey === newItem.lineKey);
      if (existingIndex >= 0) {
        return prev.map((line, index) =>
          index === existingIndex
            ? {
                ...line,
                quantity: line.quantity + 1,
                subtotal: (line.quantity + 1) * line.unitPrice,
              }
            : line,
        );
      }
      return [...prev, newItem];
    });
  }

  function openProductCustomizer(product: Product) {
    const defaultSize = getPosProductDefaultSize(product);
    setCustomizingProduct(product);
    setCustomSize(defaultSize.name);
    setCustomFlavors([]);
    setCustomAddOns([]);
  }

  function confirmProductCustomization() {
    if (!customizingProduct) return;
    addItemToTicket(customizingProduct, {
      size: customSize,
      flavors: customFlavors,
      addOns: customAddOns,
    });
    setCustomizingProduct(null);
  }

  function updateLineQuantity(lineKey: string, delta: number) {
    setSubmitError("");
    setCartItems((prev) => {
      const target = prev.find((line) => line.lineKey === lineKey);
      if (!target) return prev;

      if (delta > 0) {
        const catalogProduct = activeProducts.find((p) => p.id === target.productId);
        const allocated = getAllocatedStockForProduct(target.productId);
        if (catalogProduct && allocated + delta > catalogProduct.stock) {
          setSubmitError(
            `No hay más stock disponible de ${target.name} (${catalogProduct.stock} disp.).`,
          );
          return prev;
        }
      }

      const nextQty = target.quantity + delta;
      if (nextQty <= 0) {
        return prev.filter((line) => line.lineKey !== lineKey);
      }
      return prev.map((line) =>
        line.lineKey === lineKey
          ? { ...line, quantity: nextQty, subtotal: nextQty * line.unitPrice }
          : line,
      );
    });
  }

  function removeLine(lineKey: string) {
    setSubmitError("");
    setCartItems((prev) => prev.filter((line) => line.lineKey !== lineKey));
  }

  function handleSelectPaymentMethod(nextMethod: PosPaymentMethod) {
    setPaymentMethod(nextMethod);
    setSubmitError("");
    if (nextMethod === "efectivo") {
      setCashTouched(false);
      setCashReceived(cartTotal);
    } else if (nextMethod === "mixto") {
      const halfDigital = Math.floor(cartTotal / 2);
      const remainingCash = cartTotal - halfDigital;
      setMixedDigitalAmount(halfDigital);
      setMixedCashAmount(remainingCash);
      setCashReceived(remainingCash);
      setCashTouched(false);
    }
  }

  function handleMixedAmountChange(side: "cash" | "digital", rawValue: string) {
    const cleanValue = sanitizeCopAmount(rawValue);
    const balanced = balanceMixedPaymentAmounts(cartTotal, side, cleanValue);
    setMixedCashAmount(balanced.cashAmount);
    setMixedDigitalAmount(balanced.digitalAmount);
    setCashReceived(balanced.cashAmount);
    setCashTouched(false);
  }

  function handleCashReceivedChange(value: number) {
    setCashTouched(true);
    setCashReceived(sanitizeCopAmount(value));
  }

  function resetDraftAfterSuccess() {
    setCartItems([]);
    setCustomizingProduct(null);
    setTableNumber("");
    setCustomerName("");
    setNotes("");
    setCashReceived(0);
    setCashTouched(false);
    setMixedCashAmount(0);
    setMixedDigitalAmount(0);
    setDigitalReference("");
  }

  async function handleConfirmPosOrder() {
    if (cartItems.length === 0 || !paymentCalculation.isValid || submitting) return;
    if (serviceType === "mesa" && !tableNumber.trim()) {
      setSubmitError("Indica el número o nombre de la mesa para enviar la comanda.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    const { payload, preview } = buildPosOrderPayload({
      items: cartItems,
      serviceType,
      tableNumber,
      customerName,
      notes,
      payment: paymentCalculation,
    });

    try {
      const result = await onSubmitPosOrder(payload, preview);
      if (!result.ok) {
        setSubmitError(result.error ?? "No se pudo registrar el pedido POS.");
        return;
      }

      setLastSubmitted({
        synced: Boolean(result.synced),
        summary: paymentCalculation.summaryLabel,
        changeAmount: paymentCalculation.changeAmount,
        order: result.order,
      });
      resetDraftAfterSuccess();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Error inesperado al registrar pedido POS.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const customizingSizes = customizingProduct ? getProductSizes(customizingProduct) : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-pos-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        data-testid="quick-bar-pos-modal"
        className="relative flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 text-slate-100 shadow-2xl"
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/90 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-pink-600/20 text-pink-400 border border-pink-500/30">
              <GlassWater className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="quick-pos-title" className="text-lg font-extrabold tracking-tight text-white sm:text-xl">
                  Terminal POS Barra
                </h2>
                <Badge
                  variant="outline"
                  data-testid="pos-connectivity-badge"
                  className={
                    isOnline
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                      : "border-amber-400/50 bg-amber-500/20 text-amber-200"
                  }
                >
                  {isOnline ? (
                    <span className="inline-flex items-center gap-1">
                      <Wifi className="h-3 w-3" /> En línea
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <WifiOff className="h-3 w-3" /> Modo Offline (Cola Resiliente)
                    </span>
                  )}
                </Badge>
              </div>
              <p className="text-xs text-slate-400">
                Toma rápida en caja · Precios reales COP · Efectivo, Nequi, QR y Cobro Mixto
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar terminal POS"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Confirmación rápida del último pedido enviado */}
        {lastSubmitted && (
          <div
            role="status"
            data-testid="pos-last-order-banner"
            className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 text-sm sm:px-6 ${
              lastSubmitted.synced
                ? "border-emerald-500/30 bg-emerald-950/60 text-emerald-100"
                : "border-amber-500/40 bg-amber-950/60 text-amber-100"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2
                className={`h-5 w-5 shrink-0 ${
                  lastSubmitted.synced ? "text-emerald-400" : "text-amber-300"
                }`}
              />
              <div>
                <p className="font-bold">
                  {lastSubmitted.synced
                    ? "Comanda cobrada y enviada a barra"
                    : "Comanda cobrada y guardada en cola offline"}
                </p>
                <p className="text-xs opacity-90">
                  {lastSubmitted.summary}
                  {lastSubmitted.changeAmount > 0
                    ? ` · Entregar vueltas: ${formatCop(lastSubmitted.changeAmount)}`
                    : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {lastSubmitted.order && onPrintOrder && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="pos-print-last-order"
                  onClick={() => onPrintOrder(lastSubmitted.order!)}
                  className="min-h-11 border-white/25 bg-slate-900 text-white hover:bg-slate-800"
                >
                  <Printer className="h-4 w-4" /> Imprimir Comanda
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setLastSubmitted(null)}
                className="min-h-11 text-slate-300 hover:bg-white/10 hover:text-white"
              >
                Ocultar
              </Button>
            </div>
          </div>
        )}

        {/* Cuerpo Principal Responsive (Catálogo + Cobro) */}
        <div className="grid flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-12">
          {/* Panel Izquierdo: Catálogo Táctil */}
          <div className="flex flex-col border-b border-slate-800 p-4 sm:p-5 lg:col-span-7 lg:border-b-0 lg:border-r lg:overflow-y-auto">
            <div className="space-y-3">
              {/* Buscador */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Buscar bebida o sabor (ej. Lulo, Mojito, Maracuyá)..."
                  aria-label="Buscar producto POS"
                  className="min-h-11 border-slate-700 bg-slate-900 pl-10 pr-10 text-white placeholder:text-slate-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Limpiar búsqueda POS"
                    className="absolute right-2 top-1.5 flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Categorías táctiles */}
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar categoría POS">
                {categories.map((category) => {
                  const isActive = selectedCategory === category;
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setSelectedCategory(category)}
                      className={`min-h-11 rounded-xl border px-3.5 text-xs font-bold uppercase tracking-wider transition-all active:scale-95 ${
                        isActive
                          ? "border-cyan-400 bg-cyan-500/20 text-cyan-200 shadow-sm"
                          : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:text-white"
                      }`}
                    >
                      {category === "all" ? "Todos" : category}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Personalizador Inline Rápido cuando el cajero elige Opciones */}
            {customizingProduct && (
              <div
                data-testid="pos-inline-customizer"
                className="mt-4 space-y-3 rounded-2xl border border-cyan-500/40 bg-slate-900 p-4 shadow-lg"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                      Personalización rápida
                    </p>
                    <h3 className="text-base font-extrabold text-white">
                      {customizingProduct.name}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCustomizingProduct(null)}
                    aria-label="Cerrar personalización rápida"
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Tamaños / Presentaciones reales */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-300">Presentación:</p>
                  <div className="flex flex-wrap gap-2">
                    {customizingSizes.map((sizeOption) => {
                      const active = customSize === sizeOption.name;
                      return (
                        <button
                          key={sizeOption.name}
                          type="button"
                          onClick={() => setCustomSize(sizeOption.name)}
                          className={`min-h-11 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                            active
                              ? "border-pink-500 bg-pink-600/25 text-white"
                              : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500"
                          }`}
                        >
                          {sizeOption.name} · {formatCop(sizeOption.price)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Sabores */}
                {customizingProduct.availableFlavors.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-300">Sabores:</p>
                    <div className="flex flex-wrap gap-2">
                      {customizingProduct.availableFlavors.map((flavor) => {
                        const active = customFlavors.includes(flavor);
                        return (
                          <button
                            key={flavor}
                            type="button"
                            onClick={() =>
                              setCustomFlavors((prev) =>
                                prev.includes(flavor)
                                  ? prev.filter((item) => item !== flavor)
                                  : [...prev, flavor],
                              )
                            }
                            className={`min-h-11 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                              active
                                ? "border-cyan-400 bg-cyan-500/20 text-cyan-200"
                                : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500"
                            }`}
                          >
                            {flavor}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Adiciones */}
                {customizingProduct.availableAddOns.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-300">Toppings / Adiciones:</p>
                    <div className="flex flex-wrap gap-2">
                      {customizingProduct.availableAddOns.map((addOn) => {
                        const active = customAddOns.includes(addOn.name);
                        return (
                          <button
                            key={addOn.name}
                            type="button"
                            onClick={() =>
                              setCustomAddOns((prev) =>
                                prev.includes(addOn.name)
                                  ? prev.filter((item) => item !== addOn.name)
                                  : [...prev, addOn.name],
                              )
                            }
                            className={`min-h-11 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                              active
                                ? "border-pink-400 bg-pink-500/20 text-pink-200"
                                : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500"
                            }`}
                          >
                            {addOn.name} (+{formatCop(addOn.price)})
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <Button
                    type="button"
                    data-testid="pos-confirm-customize"
                    onClick={confirmProductCustomization}
                    className="min-h-11 bg-[#E5196E] px-5 font-bold text-white hover:bg-[#c8145f]"
                  >
                    <Plus className="h-4 w-4" />
                    Agregar{" "}
                    {formatCop(
                      createPosCartItem(customizingProduct, {
                        size: customSize,
                        flavors: customFlavors,
                        addOns: customAddOns,
                      }).unitPrice,
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Grid de productos táctil */}
            <div className="mt-4 flex-1">
              {loadingProducts ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[1, 2, 3, 4].map((item) => (
                    <div key={item} className="h-28 animate-pulse rounded-xl bg-slate-900" />
                  ))}
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-8 text-center text-sm text-slate-400">
                  No encontramos productos disponibles con ese filtro.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {filteredProducts.map((product) => {
                    const defaultSize = getPosProductDefaultSize(product);
                    const allocated = getAllocatedStockForProduct(product.id);
                    const outOfStock = product.stock <= 0 || allocated >= product.stock;
                    const hasCustomizationOptions =
                      getProductSizes(product).length > 1 ||
                      product.availableFlavors.length > 0 ||
                      product.availableAddOns.length > 0;

                    return (
                      <div
                        key={product.id}
                        data-testid={`pos-product-card-${product.id}`}
                        className={`flex flex-col justify-between rounded-xl border p-3.5 transition-colors ${
                          outOfStock
                            ? "border-slate-800 bg-slate-900/40 opacity-60"
                            : "border-slate-800 bg-slate-900 hover:border-slate-600"
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-bold text-white">{product.name}</h3>
                            <Badge
                              variant="outline"
                              className={
                                product.stock > 0
                                  ? "border-slate-700 bg-slate-800 text-[11px] text-slate-200"
                                  : "border-rose-500/40 bg-rose-500/15 text-[11px] text-rose-300"
                              }
                            >
                              {product.stock > 0 ? `${product.stock} disp.` : "Agotado"}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-400 capitalize">
                            {product.category} · {defaultSize.name}
                          </p>
                          <p className="text-base font-black text-cyan-300">
                            {formatCop(defaultSize.price)}
                          </p>
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                          <Button
                            type="button"
                            data-testid={`pos-quick-add-${product.id}`}
                            disabled={outOfStock}
                            onClick={() => addItemToTicket(product)}
                            className="min-h-11 flex-1 bg-[#E5196E] font-bold text-white hover:bg-[#c8145f] disabled:bg-slate-800 disabled:text-slate-500"
                          >
                            <Plus className="h-4 w-4" />
                            {product.stock <= 0 ? "Agotado" : "Agregar"}
                          </Button>
                          {hasCustomizationOptions && (
                            <Button
                              type="button"
                              variant="outline"
                              data-testid={`pos-customize-${product.id}`}
                              disabled={product.stock <= 0}
                              onClick={() => openProductCustomizer(product)}
                              aria-label={`Personalizar ${product.name}`}
                              className="min-h-11 border-slate-700 bg-slate-950 px-3 text-xs font-semibold text-cyan-300 hover:bg-slate-800 hover:text-cyan-200"
                            >
                              <SlidersHorizontal className="h-4 w-4" />
                              Opciones
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Panel Derecho: Ticket, Modalidad de Barra y Cobro */}
          <div className="flex flex-col justify-between bg-slate-900/50 p-4 sm:p-5 lg:col-span-5 lg:overflow-y-auto">
            <div className="space-y-4">
              {/* Modalidad de servicio */}
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Destino de Comanda
                </p>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Destino de comanda POS">
                  <button
                    type="button"
                    data-testid="pos-service-pickup"
                    onClick={() => setServiceType("pickup")}
                    className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold transition-all ${
                      serviceType === "pickup"
                        ? "border-cyan-400 bg-cyan-500/20 text-cyan-200"
                        : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    <GlassWater className="h-4 w-4" /> En Barra
                  </button>
                  <button
                    type="button"
                    data-testid="pos-service-mesa"
                    onClick={() => setServiceType("mesa")}
                    className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold transition-all ${
                      serviceType === "mesa"
                        ? "border-pink-400 bg-pink-500/20 text-pink-200"
                        : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    <UtensilsCrossed className="h-4 w-4" /> Mesa
                  </button>
                </div>

                {serviceType === "mesa" && (
                  <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900 p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_TABLES.map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setTableNumber(num)}
                          className={`min-h-10 min-w-10 rounded-lg border px-2.5 text-xs font-bold ${
                            tableNumber === num
                              ? "border-pink-400 bg-pink-600 text-white"
                              : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500"
                          }`}
                        >
                          M{num}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pos-table-number" className="text-xs text-slate-300">
                        Número o nombre de mesa
                      </Label>
                      <Input
                        id="pos-table-number"
                        value={tableNumber}
                        onChange={(event) => setTableNumber(event.target.value)}
                        placeholder="Ej: 4 o Terraza 2"
                        className="min-h-11 border-slate-700 bg-slate-950 text-white placeholder:text-slate-500"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="pos-customer-name" className="text-xs text-slate-300">
                      Cliente (opcional)
                    </Label>
                    <Input
                      id="pos-customer-name"
                      value={customerName}
                      onChange={(event) => setCustomerName(event.target.value)}
                      placeholder="Cliente Barra"
                      className="min-h-11 border-slate-700 bg-slate-900 text-white placeholder:text-slate-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pos-notes" className="text-xs text-slate-300">
                      Nota (opcional)
                    </Label>
                    <Input
                      id="pos-notes"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Sin pitillo, extra hielo..."
                      className="min-h-11 border-slate-700 bg-slate-900 text-white placeholder:text-slate-500"
                    />
                  </div>
                </div>
              </div>

              {/* Ticket / Carrito POS */}
              <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900 p-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Ticket Actual ({totalUnits} {totalUnits === 1 ? "vaso" : "vasos"})
                  </span>
                  {cartItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCartItems([])}
                      className="text-xs font-semibold text-rose-400 hover:text-rose-300"
                    >
                      Vaciar
                    </button>
                  )}
                </div>

                {cartItems.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400">
                    Toca cualquier bebida del menú para agregarla en 1 tap.
                  </p>
                ) : (
                  <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                    {cartItems.map((line) => (
                      <div
                        key={line.lineKey}
                        data-testid={`pos-ticket-line-${line.productId}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/80 p-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-white">{line.name}</p>
                          <p className="text-[11px] text-slate-400">
                            {line.customization.size}
                            {line.customization.flavors.length > 0
                              ? ` · ${line.customization.flavors.join(", ")}`
                              : ""}
                            {line.customization.addOns.length > 0
                              ? ` · +${line.customization.addOns.join(", ")}`
                              : ""}
                          </p>
                          <p className="text-xs font-bold text-cyan-300">
                            {formatCop(line.subtotal)}
                          </p>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={`Disminuir cantidad de ${line.name}`}
                            onClick={() => updateLineQuantity(line.lineKey, -1)}
                            className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="w-7 text-center text-sm font-extrabold text-white">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label={`Aumentar cantidad de ${line.name}`}
                            onClick={() => updateLineQuantity(line.lineKey, 1)}
                            className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Eliminar ${line.name}`}
                            onClick={() => removeLine(line.lineKey)}
                            className="flex h-11 w-11 items-center justify-center rounded-lg text-rose-400 hover:bg-rose-500/15"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-slate-800 pt-2.5">
                  <span className="text-sm font-bold uppercase tracking-wider text-slate-300">
                    Total a Cobrar
                  </span>
                  <span
                    data-testid="pos-order-total"
                    className="text-2xl font-black text-white"
                  >
                    {formatCop(cartTotal)}
                  </span>
                </div>
              </div>

              {/* Selector de método de pago */}
              <div className="space-y-2.5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Método de Pago
                </p>
                <div
                  className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                  role="group"
                  aria-label="Método de pago POS"
                >
                  {PAYMENT_METHOD_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const active = paymentMethod === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        data-testid={`pos-method-${option.id}`}
                        aria-pressed={active}
                        onClick={() => handleSelectPaymentMethod(option.id)}
                        className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-xs font-bold transition-all active:scale-95 ${
                          active
                            ? "border-pink-500 bg-pink-600/25 text-white shadow-sm"
                            : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{option.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Calculadora de Efectivo / Vueltas / Digital / Cobro Mixto */}
                {cartTotal > 0 && (
                  <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-3.5">
                    {paymentMethod === "mixto" && (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <span className="text-xs font-semibold text-slate-300">
                            Canal digital del cobro mixto:
                          </span>
                          <div className="grid grid-cols-3 gap-1.5">
                            {DIGITAL_CHANNELS.map((channel) => (
                              <button
                                key={channel}
                                type="button"
                                data-testid={`pos-mixed-channel-${channel}`}
                                onClick={() => setMixedDigitalChannel(channel)}
                                className={`min-h-11 rounded-lg border px-2 text-xs font-bold ${
                                  mixedDigitalChannel === channel
                                    ? "border-cyan-400 bg-cyan-500/20 text-cyan-200"
                                    : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500"
                                }`}
                              >
                                {POS_DIGITAL_CHANNEL_LABELS[channel]}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div className="space-y-1">
                            <Label htmlFor="pos-mixed-digital" className="text-xs text-slate-300">
                              {POS_DIGITAL_CHANNEL_LABELS[mixedDigitalChannel]} (COP)
                            </Label>
                            <Input
                              id="pos-mixed-digital"
                              data-testid="pos-mixed-digital-input"
                              type="number"
                              min={0}
                              max={cartTotal}
                              step={500}
                              inputMode="numeric"
                              value={mixedDigitalAmount}
                              onChange={(event) =>
                                handleMixedAmountChange("digital", event.target.value)
                              }
                              className="min-h-11 border-slate-700 bg-slate-950 font-bold text-white"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="pos-mixed-cash" className="text-xs text-slate-300">
                              Efectivo aplicado (COP)
                            </Label>
                            <Input
                              id="pos-mixed-cash"
                              data-testid="pos-mixed-cash-input"
                              type="number"
                              min={0}
                              max={cartTotal}
                              step={500}
                              inputMode="numeric"
                              value={mixedCashAmount}
                              onChange={(event) =>
                                handleMixedAmountChange("cash", event.target.value)
                              }
                              className="min-h-11 border-slate-700 bg-slate-950 font-bold text-white"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {(paymentMethod === "efectivo" ||
                      (paymentMethod === "mixto" && mixedCashAmount > 0)) && (
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            data-testid="pos-bill-exact"
                            onClick={() =>
                              handleCashReceivedChange(
                                paymentMethod === "mixto" ? mixedCashAmount : cartTotal,
                              )
                            }
                            className="min-h-11 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 text-xs font-bold text-cyan-200 hover:bg-cyan-500/25"
                          >
                            Exacto (
                            {formatCop(paymentMethod === "mixto" ? mixedCashAmount : cartTotal)})
                          </button>
                          {quickCashBills.map((bill) => (
                            <button
                              key={bill}
                              type="button"
                              data-testid={`pos-bill-${bill}`}
                              onClick={() => handleCashReceivedChange(bill)}
                              className={`min-h-11 rounded-lg border px-3 text-xs font-bold transition-colors ${
                                cashReceived === bill
                                  ? "border-pink-400 bg-pink-600/25 text-white"
                                  : "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-500"
                              }`}
                            >
                              {formatCop(bill)}
                            </button>
                          ))}
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="pos-cash-received" className="text-xs text-slate-300">
                            {paymentMethod === "mixto"
                              ? "Efectivo recibido del cliente (COP)"
                              : "Efectivo recibido (COP)"}
                          </Label>
                          <Input
                            id="pos-cash-received"
                            data-testid="pos-cash-received-input"
                            type="number"
                            min={0}
                            step={500}
                            inputMode="numeric"
                            value={cashReceived}
                            onChange={(event) =>
                              handleCashReceivedChange(sanitizeCopAmount(event.target.value))
                            }
                            className="min-h-11 border-slate-700 bg-slate-950 text-base font-extrabold text-white"
                          />
                        </div>

                        {paymentCalculation.isValid ? (
                          <div
                            data-testid="pos-change-display"
                            className="flex items-center justify-between rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2.5 text-emerald-200"
                          >
                            <span className="text-xs font-bold uppercase tracking-wider">
                              Vueltas a entregar
                            </span>
                            <span className="text-lg font-black text-emerald-300">
                              {formatCop(paymentCalculation.changeAmount)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    )}

                    {(paymentMethod === "nequi" ||
                      paymentMethod === "daviplata" ||
                      paymentMethod === "qr" ||
                      paymentMethod === "mixto") && (
                      <div className="space-y-2">
                        {paymentMethod === "qr" && (
                          <div className="flex items-center gap-3 rounded-lg border border-cyan-500/30 bg-cyan-950/30 p-2.5 text-xs text-cyan-200">
                            <QrCode className="h-8 w-8 shrink-0 text-cyan-300" />
                            <div>
                              <p className="font-bold">Pago con Código QR de Barra</p>
                              <p className="text-cyan-300/80">
                                Monto a confirmar en pantalla del cliente: {formatCop(cartTotal)}
                              </p>
                            </div>
                          </div>
                        )}
                        <div className="space-y-1">
                          <Label htmlFor="pos-digital-ref" className="text-xs text-slate-300">
                            Referencia / Últimos 4 dígitos (opcional)
                          </Label>
                          <Input
                            id="pos-digital-ref"
                            data-testid="pos-digital-reference-input"
                            value={digitalReference}
                            onChange={(event) => setDigitalReference(event.target.value)}
                            placeholder="Ej: 4821 o M12345"
                            className="min-h-11 border-slate-700 bg-slate-950 text-white placeholder:text-slate-500"
                          />
                        </div>
                      </div>
                    )}

                    {paymentCalculation.validationError && (
                      <div
                        role="alert"
                        data-testid="pos-payment-error"
                        className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs font-bold text-rose-200"
                      >
                        {paymentCalculation.validationError}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer de Acción POS */}
            <div className="mt-4 space-y-2.5 border-t border-slate-800 pt-4">
              {submitError && (
                <div
                  role="alert"
                  data-testid="pos-submit-error"
                  className="rounded-lg border border-rose-500/50 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-200"
                >
                  {submitError}
                </div>
              )}

              <Button
                type="button"
                data-testid="pos-submit-order"
                disabled={
                  cartItems.length === 0 || !paymentCalculation.isValid || submitting
                }
                onClick={() => void handleConfirmPosOrder()}
                className="min-h-12 w-full bg-[#E5196E] text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-pink-600/25 hover:bg-[#c8145f] disabled:bg-slate-800 disabled:text-slate-500"
              >
                {submitting
                  ? "Registrando comanda..."
                  : isOnline
                    ? `Cobrar y Enviar a Barra · ${formatCop(cartTotal)}`
                    : `Encolar Pedido Offline · ${formatCop(cartTotal)}`}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
