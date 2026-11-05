"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, Send, RotateCcw, Sparkles, ChevronRight, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestions?: Array<{
    id: string;
    name: string;
    category: string;
    priceCop: number;
    image?: string;
    href: string;
  }>;
};

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
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const launcherRef = useRef<HTMLButtonElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ocultar Opsy Bot en las rutas administrativas
  const isAdminRoute = pathname?.startsWith("/admin");

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

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

  if (isAdminRoute) {
    return null;
  }

  const handleSendMessage = async (textToSend?: string) => {
    const rawText = textToSend || inputValue;
    const trimmed = rawText.trim();
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
      // Tomar hasta 6 turnos previos para no saturar tokens
      const historyPayload = nextMessages
        .filter((m) => m.id !== "initial-opsy-greeting")
        .slice(-6)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const response = await fetch("/api/opsy/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: trimmed,
          history: historyPayload.slice(0, -1), // Excluir el mensaje recién agregado que va en message
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error(
            "¡Parce, te tomaste muchos tragos de preguntas! Espera unos minutos y volvemos a parchar 🐼⏱️"
          );
        }
        throw new Error("Opsy se embolató un segundo en la barra. ¡Prueba otra vez!");
      }

      const data = (await response.json()) as {
        reply: string;
        suggestions?: ChatMessage["suggestions"];
      };

      const assistantMessage: ChatMessage = {
        id: `opsy-${Date.now()}`,
        role: "assistant",
        content: data.reply,
        suggestions: data.suggestions,
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
                    <div className="mt-2.5 w-full max-w-[90%] space-y-2">
                      <p className="text-xs font-semibold text-purple-300 flex items-center gap-1">
                        <ShoppingBag className="w-3.5 h-3.5 text-primary" />
                        Recomendaciones de Opsy:
                      </p>
                      <div className="grid grid-cols-1 gap-2">
                        {message.suggestions.map((item) => (
                          <div
                            key={item.id}
                            className="bg-black/60 border border-purple-500/30 hover:border-primary/60 rounded-xl p-2.5 flex items-center justify-between gap-2.5 transition-colors group"
                          >
                            <div className="flex items-center gap-2.5 overflow-hidden">
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
                                <h4 className="text-xs font-bold text-white truncate group-hover:text-primary transition-colors">
                                  {item.name}
                                </h4>
                                <span className="text-xs text-primary font-black">
                                  ${item.priceCop.toLocaleString("es-CO")} COP
                                </span>
                              </div>
                            </div>

                            <Link
                              href={item.href}
                              onClick={() => setIsOpen(false)}
                              className="inline-flex items-center gap-1 text-xs bg-primary/20 hover:bg-primary text-primary hover:text-white px-2.5 py-1.5 rounded-lg font-semibold transition-all flex-shrink-0"
                            >
                              Ver
                              <ChevronRight className="w-3 h-3" />
                            </Link>
                          </div>
                        ))}
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
            <div className="px-4 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar border-t border-white/5">
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

