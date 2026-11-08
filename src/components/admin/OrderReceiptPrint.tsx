"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileText,
  Printer,
  Tag,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatItemStickers,
  formatOrderReceiptEscPos,
  formatOrderReceiptText,
  getReceiptServiceLabel,
  getTotalCupCount,
  type ReceiptPaperWidth,
} from "@/lib/orders/receipt-formatter";
import type { Order } from "@/types/orders";

export type OrderReceiptPrintProps = {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
};

export function OrderReceiptPrint({ order, isOpen, onClose }: OrderReceiptPrintProps) {
  const [paperWidth, setPaperWidth] = useState<ReceiptPaperWidth>("58mm");
  const [printType, setPrintType] = useState<"ticket" | "stickers">("ticket");
  const [copied, setCopied] = useState(false);

  if (!isOpen || !order) return null;

  const totalCups = getTotalCupCount(order);
  const serviceLabel = getReceiptServiceLabel(order);
  const receiptText = formatOrderReceiptText(order, { width: paperWidth });
  const stickers = formatItemStickers(order, { width: paperWidth });

  async function handleCopyText() {
    try {
      const textToCopy = printType === "ticket"
        ? receiptText
        : stickers.map((s) => s.text).join("\n\n" + "=".repeat(paperWidth === "58mm" ? 32 : 48) + "\n\n");
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback si clipboard falla
    }
  }

  function handleDownloadEscPos() {
    if (!order) return;
    const bytes = formatOrderReceiptEscPos(order, { width: paperWidth });
    const blob = new Blob([bytes as unknown as BlobPart], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comanda-${order.id.slice(-6)}-${paperWidth}.bin`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleWebPrint() {
    window.print();
  }

  return (
    <>
      {/* Estilos específicos de impresión térmica */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #coctels-thermal-print-area,
          #coctels-thermal-print-area * {
            visibility: visible !important;
          }
          #coctels-thermal-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: ${paperWidth === "58mm" ? "48mm" : "72mm"} !important;
            margin: 0 !important;
            padding: 2mm !important;
            background: white !important;
            color: black !important;
            font-family: monospace !important;
            font-size: ${paperWidth === "58mm" ? "10px" : "12px"} !important;
            line-height: 1.25 !important;
          }
          .thermal-page-break {
            page-break-after: always !important;
            break-after: page !important;
          }
        }
      `}</style>

      {/* Modal / Diálogo para vista en pantalla */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-dialog-title"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          data-testid="order-receipt-modal"
          className="relative flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        >
          {/* Header del modal */}
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-500/10 text-pink-400">
                <Printer className="h-5 w-5" />
              </div>
              <div>
                <h2 id="receipt-dialog-title" className="text-base font-bold text-white sm:text-lg">
                  Impresión Térmica de Barra
                </h2>
                <p className="text-xs text-slate-400">
                  Pedido #{order.id} · {order.customerName}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar modal de impresión"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Barra de opciones y configuración */}
          <div className="border-b border-slate-800 bg-slate-950/60 px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Selector de tipo */}
              <div
                className="inline-flex rounded-lg border border-slate-800 bg-slate-900 p-1"
                role="group"
                aria-label="Tipo de formato de impresión"
              >
                <button
                  type="button"
                  data-testid="btn-format-ticket"
                  onClick={() => setPrintType("ticket")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    printType === "ticket"
                      ? "bg-pink-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Comanda Completa
                </button>
                <button
                  type="button"
                  data-testid="btn-format-stickers"
                  onClick={() => setPrintType("stickers")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    printType === "stickers"
                      ? "bg-pink-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Tag className="h-3.5 w-3.5" />
                  Etiquetas por Vaso ({totalCups})
                </button>
              </div>

              {/* Selector de ancho */}
              <div
                className="inline-flex rounded-lg border border-slate-800 bg-slate-900 p-1"
                role="group"
                aria-label="Ancho de papel térmico"
              >
                <button
                  type="button"
                  data-testid="btn-width-58mm"
                  onClick={() => setPaperWidth("58mm")}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    paperWidth === "58mm"
                      ? "bg-cyan-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  58mm (Mini)
                </button>
                <button
                  type="button"
                  data-testid="btn-width-80mm"
                  onClick={() => setPaperWidth("80mm")}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    paperWidth === "80mm"
                      ? "bg-cyan-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  80mm (Estándar)
                </button>
              </div>
            </div>
          </div>

          {/* Área de Preview interactivo */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="mx-auto flex flex-col items-center">
              <div
                className="w-full rounded-xl border border-slate-700 bg-slate-800/40 p-4"
                style={{ maxWidth: paperWidth === "58mm" ? "340px" : "440px" }}
              >
                <div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Simulación Térmica ({paperWidth})</span>
                  <Badge variant="outline" className="border-slate-600 text-[10px] text-slate-300">
                    {serviceLabel}
                  </Badge>
                </div>

                {/* Contenedor tipo papel térmico */}
                <div
                  data-testid="receipt-preview-content"
                  className="rounded-lg border border-slate-300 bg-white p-4 font-mono text-black shadow-inner"
                  style={{
                    fontSize: paperWidth === "58mm" ? "11px" : "12px",
                    lineHeight: "1.3",
                  }}
                >
                  {printType === "ticket" ? (
                    <pre className="whitespace-pre-wrap font-mono">{receiptText}</pre>
                  ) : (
                    <div className="space-y-4">
                      {stickers.map((sticker, idx) => (
                        <div
                          key={`preview-sticker-${idx}`}
                          className="border-b-2 border-dashed border-slate-400 pb-3 last:border-b-0 last:pb-0"
                        >
                          <pre className="whitespace-pre-wrap font-mono">{sticker.text}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer con botones de acción 1-tap */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-950/80 px-5 py-4">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="btn-copy-receipt"
                onClick={() => void handleCopyText()}
                className="min-h-11 border-slate-700 bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-700"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                {copied ? "¡Copiado!" : "Copiar Texto"}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="btn-download-escpos"
                onClick={handleDownloadEscPos}
                className="min-h-11 border-slate-700 bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                title="Descarga comandos binarios listos para enviar a impresora térmica"
              >
                <Download className="h-4 w-4" />
                ESC/POS (.bin)
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="min-h-11 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                Cerrar
              </Button>

              <Button
                type="button"
                data-testid="btn-print-now"
                onClick={handleWebPrint}
                className="min-h-11 bg-gradient-to-r from-pink-600 to-rose-600 px-5 font-bold text-white shadow-lg shadow-pink-600/25 hover:from-pink-500 hover:to-rose-500"
              >
                <Printer className="h-4 w-4" />
                {printType === "ticket" ? "Imprimir Ticket" : `Imprimir ${totalCups} Etiquetas`}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Área dedicada exclusivamente para window.print() */}
      <div id="coctels-thermal-print-area" aria-hidden="true" className="hidden">
        {printType === "ticket" ? (
          <pre className="whitespace-pre-wrap font-mono">{receiptText}</pre>
        ) : (
          <div>
            {stickers.map((sticker, idx) => (
              <div key={`print-sticker-${idx}`} className="thermal-page-break">
                <pre className="whitespace-pre-wrap font-mono">{sticker.text}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
