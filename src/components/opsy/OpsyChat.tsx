"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  X,
  Send,
  RotateCcw,
  Sparkles,
  ChevronRight,
  ShoppingBag,
  ShoppingCart,
  Plus,
  Minus,
  Check,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart, generateCartItemId } from "@/context/cart-context";

export type ChatSuggestionSize = {
  label: string;
  priceCop: number;
};

export type ChatSuggestion = {
  id: string;
  name: string;
  category: string;
  priceCop: number | null;
  hasMultipleSizes?: boolean;
  sizes?: ChatSuggestionSize[];
  defaultSize?: string;
  image?: string;
  href: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestions?: ChatSuggestion[];
};

const MAX_CHAT_CHARS = 1000;
const RATE_LIMIT_ERROR_MESSAGE =
  "¡Parce, te tomaste muchos tragos de preguntas! Espera unos minutos y volvemos a parchar 🐼⏱️";
const DEFAULT_ERROR_MESSAGE =
  "Opsy se embolató un segundo en la barra. ¡Prueba otra vez!";

type RawWorkerProduct = {
  id?: unknown;
  name?: unknown;
  image?: unknown;
  href?: unknown;
  sizes?: Array<{
    id?: unknown;
    label?: unknown;
    name?: unknown;
    volumeOz?: unknown;
    priceCop?: unknown;
    price?: unknown;
  }>;
};

type RawLegacySuggestion = {
  id?: unknown;
  name?: unknown;
  category?: unknown;
  priceCop?: unknown;
  defaultSize?: unknown;
  sizes?: Array<{
    label?: unknown;
    name?: unknown;
    priceCop?: unknown;
    price?: unknown;
  }>;
  image?: unknown;
  href?: unknown;
};

type RawOpsyResponse = {
  reply?: unknown;
  message?: unknown;
  error?: unknown;
  suggestions?: unknown;
  products?: unknown;
};

function clampChatText(text: string): string {
  return Array.from(text).slice(0, MAX_CHAT_CHARS).join("").trim();
}

function sanitizeHref(value: unknown, fallbackId?: string): string {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  if (fallbackId) {
    return `/menu?product=${encodeURIComponent(fallbackId)}`;
  }
  return "/menu";
}

function sanitizeImage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  if (trimmed.startsWith("https://")) return trimmed;
  return undefined;
}

function extractValidSizes(
  rawSizes: unknown
): ChatSuggestionSize[] {
  if (!Array.isArray(rawSizes)) return [];
  const parsed: ChatSuggestionSize[] = [];
  for (const entry of rawSizes) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const rawPrice =
      typeof item.priceCop === "number"
        ? item.priceCop
        : typeof item.price === "number"
          ? item.price
          : null;
    if (rawPrice === null || !Number.isFinite(rawPrice) || rawPrice < 0) continue;

    const rawLabel =
      typeof item.label === "string" && item.label.trim()
        ? item.label.trim()
        : typeof item.name === "string" && item.name.trim()
          ? item.name.trim()
          : typeof item.volumeOz === "number" && Number.isFinite(item.volumeOz)
            ? `${item.volumeOz} oz`
            : "Estándar";

    parsed.push({ label: rawLabel, priceCop: rawPrice });
  }
  return parsed;
}

function normalizeOpsyResponse(data: unknown): {
  content: string;
  suggestions: ChatSuggestion[];
} {
  if (!data || typeof data !== "object") {
    throw new Error(DEFAULT_ERROR_MESSAGE);
  }

  const raw = data as RawOpsyResponse;
  const content =
    typeof raw.reply === "string" && raw.reply.trim()
      ? raw.reply.trim()
      : typeof raw.message === "string" && raw.message.trim()
        ? raw.message.trim()
        : "";

  if (!content) {
    throw new Error(DEFAULT_ERROR_MESSAGE);
  }

  if (Array.isArray(raw.suggestions)) {
    const suggestions: ChatSuggestion[] = [];
    for (const item of raw.suggestions as RawLegacySuggestion[]) {
      if (!item || typeof item !== "object") continue;
      const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : "";
      const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : "";
      if (!id || !name) continue;

      const sizes = extractValidSizes(item.sizes);
      const uniquePrices = new Set(sizes.map((s) => s.priceCop));
      const minSizePrice = sizes.length > 0 ? Math.min(...sizes.map((s) => s.priceCop)) : null;

      const explicitPriceCop =
        typeof item.priceCop === "number" && Number.isFinite(item.priceCop) && item.priceCop >= 0
          ? item.priceCop
          : null;
      const priceCop = explicitPriceCop ?? minSizePrice;

      const defaultSize =
        typeof item.defaultSize === "string" && item.defaultSize.trim()
          ? item.defaultSize.trim()
          : sizes[0]?.label ?? "Estándar";

      suggestions.push({
        id,
        name,
        category: typeof item.category === "string" ? item.category : "",
        priceCop,
        hasMultipleSizes: uniquePrices.size > 1,
        ...(sizes.length > 0 ? { sizes } : {}),
        defaultSize,
        image: sanitizeImage(item.image),
        href: sanitizeHref(item.href, id),
      });
    }
    return { content, suggestions };
  }

  if (Array.isArray(raw.products)) {
    const suggestions: ChatSuggestion[] = [];
    for (const product of raw.products as RawWorkerProduct[]) {
      if (!product || typeof product !== "object") continue;
      const id = typeof product.id === "string" && product.id.trim() ? product.id.trim() : "";
      const name = typeof product.name === "string" && product.name.trim() ? product.name.trim() : "";
      if (!id || !name) continue;

      const sizes = extractValidSizes(product.sizes);
      const uniquePrices = new Set(sizes.map((s) => s.priceCop));
      const cheapestSize = sizes.reduce<ChatSuggestionSize | null>((best, curr) => {
        if (!best || curr.priceCop < best.priceCop) return curr;
        return best;
      }, null);

      suggestions.push({
        id,
        name,
        category: "",
        priceCop: cheapestSize ? cheapestSize.priceCop : null,
        hasMultipleSizes: uniquePrices.size > 1,
        ...(sizes.length > 0 ? { sizes } : {}),
        defaultSize: cheapestSize?.label ?? "Estándar",
        image: sanitizeImage(product.image),
        href: sanitizeHref(product.href, id),
      });
    }
    return { content, suggestions };
  }

  return { content, suggestions: [] };
}

const INITIAL_MESSAGE: ChatMessage = {
  id: "initial-opsy-greeting",
  role: "assistant",
  content:
    "¡Qué más pues, parce! Soy Opsy 🐼✨, el panda bartender de Coctels OPS. ¿Qué sabor o antojo tienes hoy? Cuéntame y te recomiendo el mejor granizado o cóctel neón de la casa.",
};

const QUICK_PROMPTS = [
  "🍹 ¿Qué me recomiendas cítrico?",
  "🍧 Granizados más pedidos",
  "🛵 ¿Tienen domicilios a mi zona?",
  "🍸 Cócteles sin alcohol",
];

export default function OpsyChat() {
  const pathname = usePathname();
  const { items: cartItems, addItem, updateQuantity, totalItems, totalPrice } = useCart();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [justAddedKey, setJustAddedKey] = useState<string | null>(null);

  const launcherRef = useRef<HTMLButtonElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ocultar Opsy Bot en las rutas administrativas y en pantalla pública TV
  const isAdminRoute = pathname?.startsWith("/admin") || pathname?.startsWith("/pantalla");

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  const handleAddSuggestionToCart = useCallback(
    (item: ChatSuggestion, sizeOverride?: ChatSuggestionSize) => {
      const chosenSize = sizeOverride ?? item.sizes?.[0];
      const sizeLabel = chosenSize?.label || item.defaultSize || "Estándar";
      const unitPrice = chosenSize?.priceCop ?? item.priceCop;

      if (unitPrice === null || !Number.isFinite(unitPrice) || unitPrice < 0) {
        return;
      }

      addItem({
        productId: item.id,
        name: item.name,
        price: unitPrice,
        quantity: 1,
        image: item.image || "/catalog-placeholder.svg",
        customization: {
          size: sizeLabel,
          flavors: [],
          addOns: [],
        },
      });

      const feedbackKey = `${item.id}::${sizeLabel}`;
      setJustAddedKey(feedbackKey);
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
      feedbackTimerRef.current = setTimeout(() => {
        setJustAddedKey((current) => (current === feedbackKey ? null : current));
      }, 1400);
    },
    [addItem]
  );

  const getCartEntryForSuggestion = useCallback(
    (productId: string, sizeLabel: string) => {
      const cartItemId = generateCartItemId(productId, {
        size: sizeLabel,
        flavors: [],
        addOns: [],
      });
      return cartItems.find((entry) => entry.id === cartItemId) ?? null;
    },
    [cartItems]
  );

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      inputRef.current?.focus();
    }
  }, [isOpen, messages, scrollToBottom]);

  // Manejo de tecla Escape para cerrar y restaurar el foco
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
        launcherRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Abrir Opsy automáticamente si se navega con ?chat=opsy o mediante evento global
  useEffect(() => {
    if (isAdminRoute) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("chat") === "opsy") {
      setIsOpen(true);
    }
    const handleOpenEvent = () => setIsOpen(true);
    window.addEventListener("opsy:open", handleOpenEvent);
    return () => window.removeEventListener("opsy:open", handleOpenEvent);
  }, [isAdminRoute, pathname]);

  if (isAdminRoute) {
    return null;
  }

  const handleSendMessage = async (textToSend?: string) => {
    const rawText = textToSend || inputValue;
    const trimmed = clampChatText(rawText);
    if (!trimmed || isLoading) return;

    setInputValue("");
    setErrorMessage(null);

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setIsLoading(true);

    try {
      // Tomar hasta 6 turnos previos (máximo 5 en history) respetando límites de caracteres
      const historyPayload = nextMessages
        .filter((m) => m.id !== "initial-opsy-greeting")
        .slice(-6)
        .map((m) => ({
          role: m.role,
          content: clampChatText(m.content),
        }))
        .filter((m) => m.content.length > 0);

      const requestInit: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: trimmed,
          history: historyPayload.slice(0, -1), // Excluir el mensaje recién agregado que va en message
        }),
        cache: "no-store",
      };

      let response = await fetch("/api/opsy/chat", requestInit);
      if (response.status === 404) {
        response = await fetch("/api/chat", requestInit);
      }

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error(RATE_LIMIT_ERROR_MESSAGE);
        }
        let serverError: string | null = null;
        if (typeof response.json === "function") {
          try {
            const errorBody = (await response.json()) as RawOpsyResponse;
            if (typeof errorBody?.message === "string" && errorBody.message.trim()) {
              serverError = errorBody.message.trim();
            } else if (typeof errorBody?.error === "string" && errorBody.error.trim()) {
              serverError = errorBody.error.trim();
            }
          } catch {
            // Ignorar respuestas de error sin JSON válido
          }
        }
        throw new Error(serverError || DEFAULT_ERROR_MESSAGE);
      }

      const data: unknown = await response.json();
      const normalized = normalizeOpsyResponse(data);

      const assistantMessage: ChatMessage = {
        id: `opsy-${Date.now()}`,
        role: "assistant",
        content: normalized.content,
        suggestions: normalized.suggestions,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errorText =
        err instanceof Error
          ? err.message
          : "No pudimos conectar con Opsy. Revisa tu conexión o intenta más tarde.";
      setErrorMessage(errorText);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setMessages([INITIAL_MESSAGE]);
    setErrorMessage(null);
    inputRef.current?.focus();
  };

  return (
    <>
      {/* Botón Flotante de Lanzamiento (FAB) */}
      {!isOpen && (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Abrir asistente Opsy Bot"
          aria-expanded={isOpen}
          className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-40 group flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-tr from-purple-800 via-pink-600 to-purple-600 text-white shadow-[0_0_25px_rgba(233,30,99,0.5)] hover:shadow-[0_0_35px_rgba(138,43,226,0.8)] hover:scale-105 active:scale-95 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
        >
          <div className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-full overflow-hidden border border-white/40 flex items-center justify-center bg-black/40">
            <Image
              src="/opsy/opsy-bot.png"
              alt="Opsy el Panda"
              width={48}
              height={48}
              className="object-cover group-hover:scale-110 transition-transform duration-300"
              priority
            />
          </div>
          {/* Indicador pulsante de estado en vivo */}
          <span className="absolute top-1 right-1 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-black"></span>
          </span>
        </button>
      )}

      {/* Ventana / Modal de Chat de Opsy */}
      {isOpen && (
        <aside
          role="dialog"
          aria-label="Chat con Opsy Bot"
          className="fixed bottom-0 right-0 sm:bottom-6 sm:right-6 z-50 w-full sm:w-[400px] h-[85vh] sm:h-[560px] max-h-[600px] flex flex-col bg-slate-950/95 border-t sm:border border-purple-500/30 sm:rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] backdrop-blur-xl animate-in slide-in-from-bottom-5 duration-300 overflow-hidden"
        >
          {/* Cabecera del Chat */}
          <header className="px-4 py-3 bg-gradient-to-r from-purple-950/90 via-slate-900 to-pink-950/80 border-b border-purple-500/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-primary shadow-[0_0_12px_rgba(233,30,99,0.5)] bg-black/50">
                <Image
                  src="/opsy/opsy-bot.png"
                  alt="Opsy Avatar"
                  width={40}
                  height={40}
                  className="object-cover"
                />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-sm sm:text-base text-white tracking-wide flex items-center gap-1">
                    Opsy Bot
                    <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
                  </h3>
                </div>
                <p className="text-xs text-purple-300/80 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                  Panda Bartender • En línea
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleReset}
                title="Reiniciar chat"
                aria-label="Reiniciar conversación"
                className="w-8 h-8 rounded-full text-slate-300 hover:text-white hover:bg-white/10"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsOpen(false);
                  launcherRef.current?.focus();
                }}
                aria-label="Cerrar chat"
                className="w-8 h-8 rounded-full text-slate-300 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </header>

          {/* Área de Mensajes */}
          <div
            className="flex-1 p-4 overflow-y-auto space-y-4 text-sm"
            aria-live="polite"
          >
            {messages.map((message) => {
              const isUser = message.role === "user";
              return (
                <div
                  key={message.id}
                  className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 leading-relaxed ${
                      isUser
                        ? "bg-gradient-to-r from-pink-600 to-purple-600 text-white rounded-br-sm shadow-md"
                        : "bg-slate-900/90 border border-purple-500/20 text-slate-100 rounded-bl-sm shadow-md"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>

                  {/* Tarjetas de Sugerencias de Productos */}
                  {message.suggestions && message.suggestions.length > 0 && (
                    <div className="mt-2.5 w-full max-w-[95%] space-y-2">
                      <p className="text-xs font-semibold text-purple-300 flex items-center gap-1">
                        <ShoppingBag className="w-3.5 h-3.5 text-primary" />
                        Recomendaciones de Opsy (toca para agregar al pedido):
                      </p>
                      <div className="grid grid-cols-1 gap-2">
                        {message.suggestions.map((item) => {
                          const defaultSizeLabel =
                            item.sizes?.[0]?.label || item.defaultSize || "Estándar";
                          const canQuickAdd = typeof item.priceCop === "number";
                          const hasSelectableSizes =
                            Array.isArray(item.sizes) && item.sizes.length > 1;
                          const defaultCartEntry = getCartEntryForSuggestion(
                            item.id,
                            defaultSizeLabel
                          );
                          const totalProductQty = cartItems
                            .filter((entry) => entry.productId === item.id)
                            .reduce((sum, entry) => sum + entry.quantity, 0);
                          const isDefaultJustAdded =
                            justAddedKey === `${item.id}::${defaultSizeLabel}`;

                          return (
                            <div
                              key={item.id}
                              className={`bg-black/60 border rounded-xl p-2.5 transition-colors group ${
                                totalProductQty > 0
                                  ? "border-primary/70 bg-primary/5"
                                  : "border-purple-500/30 hover:border-primary/60"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                {canQuickAdd ? (
                                  <button
                                    type="button"
                                    onClick={() => handleAddSuggestionToCart(item)}
                                    aria-label={`Agregar ${item.name} al carrito`}
                                    className="flex-1 min-w-0 flex items-center gap-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
                                  >
                                    <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-slate-900 flex-shrink-0 border border-white/10">
                                      {item.image ? (
                                        <Image
                                          src={item.image}
                                          alt={item.name}
                                          width={40}
                                          height={40}
                                          className="object-cover w-full h-full"
                                        />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-purple-950 text-xs">
                                          🍹
                                        </div>
                                      )}
                                      {totalProductQty > 0 && (
                                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center shadow">
                                          {totalProductQty}
                                        </span>
                                      )}
                                    </div>
                                    <div className="overflow-hidden">
                                      <h4 className="text-xs font-bold text-white truncate group-hover:text-primary transition-colors">
                                        {item.name}
                                      </h4>
                                      <span className="text-xs text-primary font-black">
                                        {item.hasMultipleSizes ? "Desde " : ""}$
                                        {item.priceCop!.toLocaleString("es-CO")} COP
                                      </span>
                                    </div>
                                  </button>
                                ) : (
                                  <div className="flex-1 min-w-0 flex items-center gap-2.5 overflow-hidden">
                                    <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-slate-900 flex-shrink-0 border border-white/10">
                                      {item.image ? (
                                        <Image
                                          src={item.image}
                                          alt={item.name}
                                          width={40}
                                          height={40}
                                          className="object-cover w-full h-full"
                                        />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-purple-950 text-xs">
                                          🍹
                                        </div>
                                      )}
                                    </div>
                                    <div className="overflow-hidden">
                                      <h4 className="text-xs font-bold text-white truncate">
                                        {item.name}
                                      </h4>
                                      <span className="text-xs text-primary font-black">
                                        Ver precio en carta
                                      </span>
                                    </div>
                                  </div>
                                )}

                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {canQuickAdd ? (
                                    !hasSelectableSizes && defaultCartEntry ? (
                                      <div className="inline-flex items-center gap-1 bg-primary/20 border border-primary/40 rounded-lg p-0.5">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateQuantity(
                                              defaultCartEntry.id,
                                              defaultCartEntry.quantity - 1
                                            )
                                          }
                                          aria-label={`Quitar una unidad de ${item.name}`}
                                          className="w-7 h-7 rounded-md flex items-center justify-center text-white hover:bg-primary/40 transition-colors"
                                        >
                                          <Minus className="w-3.5 h-3.5" />
                                        </button>
                                        <span className="min-w-[18px] text-center text-xs font-black text-white">
                                          {defaultCartEntry.quantity}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleAddSuggestionToCart(item)}
                                          aria-label={`Sumar una unidad de ${item.name}`}
                                          className="w-7 h-7 rounded-md flex items-center justify-center bg-primary text-white hover:bg-primary/90 transition-colors"
                                        >
                                          <Plus className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleAddSuggestionToCart(item)}
                                        aria-label={`Agregar ${item.name}`}
                                        className={`inline-flex items-center gap-1 text-xs px-2.5 py-1.5 min-h-[34px] rounded-lg font-semibold transition-all active:scale-95 ${
                                          isDefaultJustAdded
                                            ? "bg-emerald-500 text-white"
                                            : "bg-primary hover:bg-primary/90 text-white shadow-[0_0_12px_rgba(233,30,99,0.35)]"
                                        }`}
                                      >
                                        {isDefaultJustAdded ? (
                                          <>
                                            <Check className="w-3.5 h-3.5" />
                                            Agregado
                                          </>
                                        ) : (
                                          <>
                                            <Plus className="w-3.5 h-3.5" />
                                            Agregar
                                          </>
                                        )}
                                      </button>
                                    )
                                  ) : (
                                    <Link
                                      href={item.href}
                                      onClick={() => setIsOpen(false)}
                                      className="inline-flex items-center gap-1 text-xs bg-primary/20 hover:bg-primary text-primary hover:text-white px-2.5 py-1.5 rounded-lg font-semibold transition-all"
                                    >
                                      Ver
                                      <ChevronRight className="w-3 h-3" />
                                    </Link>
                                  )}

                                  {canQuickAdd && (
                                    <Link
                                      href={item.href}
                                      onClick={() => setIsOpen(false)}
                                      title="Ver detalle en carta"
                                      aria-label={`Ver ${item.name} en la carta`}
                                      className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </Link>
                                  )}
                                </div>
                              </div>

                              {/* Selector rápido de tamaños para productos con múltiples presentaciones */}
                              {hasSelectableSizes && item.sizes && (
                                <div className="mt-2 pt-2 border-t border-white/10 flex flex-wrap gap-1.5">
                                  {item.sizes.map((sizeOption) => {
                                    const sizeEntry = getCartEntryForSuggestion(
                                      item.id,
                                      sizeOption.label
                                    );
                                    const isSizeAdded =
                                      justAddedKey === `${item.id}::${sizeOption.label}`;
                                    return (
                                      <button
                                        key={`${item.id}-${sizeOption.label}`}
                                        type="button"
                                        onClick={() =>
                                          handleAddSuggestionToCart(item, sizeOption)
                                        }
                                        aria-label={`Agregar ${item.name} ${sizeOption.label}`}
                                        className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border transition-all active:scale-95 ${
                                          isSizeAdded
                                            ? "bg-emerald-500/20 border-emerald-400 text-emerald-200"
                                            : sizeEntry
                                              ? "bg-primary/20 border-primary text-white font-semibold"
                                              : "bg-slate-900/90 border-purple-500/30 text-slate-200 hover:border-primary/70 hover:text-white"
                                        }`}
                                      >
                                        <Plus className="w-3 h-3 text-primary" />
                                        <span>{sizeOption.label}</span>
                                        <span className="text-primary font-bold">
                                          ${sizeOption.priceCop.toLocaleString("es-CO")}
                                        </span>
                                        {sizeEntry && (
                                          <span className="ml-0.5 px-1 rounded bg-primary text-white text-[10px] font-black">
                                            {sizeEntry.quantity}
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Indicador de escritura */}
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-purple-300 bg-slate-900/80 border border-purple-500/20 rounded-2xl px-3 py-2 w-fit animate-pulse">
                <span className="flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-primary animate-bounce"></span>
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.4s]"></span>
                </span>
                <span>Opsy está buscando en la carta...</span>
              </div>
            )}

            {/* Mensaje de error amigable */}
            {errorMessage && (
              <div className="bg-red-950/60 border border-red-500/30 text-red-200 text-xs rounded-xl p-3">
                {errorMessage}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Chips de Preguntas Rápidas */}
          {messages.length <= 2 && (
            <div className="px-4 py-2 flex flex-wrap items-center gap-1.5 border-t border-white/5">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleSendMessage(prompt)}
                  disabled={isLoading}
                  className="whitespace-nowrap text-xs bg-purple-950/50 hover:bg-purple-900/60 border border-purple-500/30 text-purple-200 px-2.5 py-1.5 rounded-full transition-colors active:scale-95 disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Barra de Mini-Carrito en Vivo */}
          {totalItems > 0 && (
            <div
              data-testid="opsy-mini-cart"
              className="px-3 py-2.5 bg-gradient-to-r from-purple-950/95 via-slate-900 to-pink-950/90 border-t border-primary/40 flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/40 text-primary flex items-center justify-center flex-shrink-0">
                  <ShoppingCart className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] text-purple-200 font-semibold leading-tight">
                    Tu pedido ({totalItems} {totalItems === 1 ? "producto" : "productos"})
                  </p>
                  <p className="text-xs font-black text-white truncate">
                    ${totalPrice.toLocaleString("es-CO")} COP
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Link
                  href="/cart"
                  onClick={() => setIsOpen(false)}
                  className="text-[11px] font-semibold text-purple-200 hover:text-white px-2 py-1.5 rounded-lg border border-purple-500/40 hover:bg-white/10 transition-colors"
                >
                  Carrito
                </Link>
                <Link
                  href="/checkout"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex items-center gap-1 text-xs font-bold bg-primary hover:bg-primary/90 text-white px-3 py-1.5 rounded-lg shadow-[0_0_14px_rgba(233,30,99,0.45)] transition-all active:scale-95"
                >
                  Pedir ya
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}

          {/* Formulario de Entrada */}
          <footer className="p-3 bg-slate-950 border-t border-purple-500/20">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Pregúntale a Opsy..."
                maxLength={1000}
                disabled={isLoading}
                className="flex-1 bg-slate-900 border border-purple-500/30 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              />
              <Button
                type="submit"
                size="icon"
                disabled={isLoading || !inputValue.trim()}
                aria-label="Enviar mensaje"
                className="w-10 h-10 rounded-xl bg-primary hover:bg-primary/90 text-white flex-shrink-0 shadow-[0_0_15px_rgba(233,30,99,0.4)] disabled:opacity-50 disabled:shadow-none"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
            <p className="text-[10px] text-center text-slate-500 mt-2">
              Opsy Bot utiliza IA de Coctels OPS • Precios y stock sincronizados en vivo
            </p>
          </footer>
        </aside>
      )}
    </>
  );
}

