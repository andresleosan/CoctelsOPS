"use client";

import { useEffect, useState, useId } from "react";
import QRCode from "qrcode";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Layers,
  Printer,
  QrCode,
  Sparkles,
  UtensilsCrossed,
  GlassWater,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type QrTargetMode = "menu" | "tenant";
export type QrServiceMode = "mesa" | "barra" | "lote";
export type QrCardTheme = "neon" | "print";

export type QrItem = {
  label: string;
  mesaValue: string;
  url: string;
  svg: string;
};

export type QrGeneratorCardProps = {
  defaultSlug?: string;
  storeName?: string;
};

export function buildQrTargetUrl({
  baseUrl,
  targetMode,
  tenantSlug,
  mesa,
}: {
  baseUrl: string;
  targetMode: QrTargetMode;
  tenantSlug?: string;
  mesa?: string;
}): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const path = targetMode === "tenant" && tenantSlug?.trim()
    ? `/m/${encodeURIComponent(tenantSlug.trim())}`
    : "/menu";

  const url = new URL(path, normalizedBase || "http://localhost:9002");
  if (mesa && mesa.trim().length > 0) {
    url.searchParams.set("mesa", mesa.trim());
  }
  return url.toString();
}

export function QrGeneratorCard({
  defaultSlug = "principal",
  storeName = "Coctels OPS",
}: QrGeneratorCardProps) {
  const id = useId();
  const [baseUrl, setBaseUrl] = useState("http://localhost:9002");
  const [targetMode, setTargetMode] = useState<QrTargetMode>("menu");
  const [tenantSlug, setTenantSlug] = useState(defaultSlug);
  const [serviceMode, setServiceMode] = useState<QrServiceMode>("mesa");
  const [tableNumber, setTableNumber] = useState("1");
  const [cardTheme, setCardTheme] = useState<QrCardTheme>("neon");

  // Rango para modo lote
  const [batchStart, setBatchStart] = useState(1);
  const [batchEnd, setBatchEnd] = useState(5);
  const [batchPrefix, setBatchPrefix] = useState("Mesa ");

  const [activeQr, setActiveQr] = useState<QrItem | null>(null);
  const [batchQrs, setBatchQrs] = useState<QrItem[]>([]);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Inicializar baseUrl con origin en navegador
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.origin) {
      setBaseUrl(window.location.origin);
    }
  }, []);

  // Generar QR cuando cambian los parámetros
  useEffect(() => {
    let isCancelled = false;

    async function generate() {
      setGenerating(true);
      try {
        if (serviceMode === "lote") {
          const start = Math.max(1, Math.min(batchStart, batchEnd));
          const end = Math.min(100, Math.max(batchStart, batchEnd));
          const items: QrItem[] = [];

          for (let i = start; i <= end; i++) {
            const mesaValue = `${i}`;
            const label = `${batchPrefix}${i}`.trim();
            const url = buildQrTargetUrl({
              baseUrl,
              targetMode,
              tenantSlug,
              mesa: mesaValue,
            });

            const svg = await QRCode.toString(url, {
              type: "svg",
              margin: 1,
              color: {
                dark: "#000000",
                light: "#ffffff",
              },
            });

            items.push({ label, mesaValue, url, svg });
          }

          if (!isCancelled) {
            setBatchQrs(items);
            setActiveQr(items[0] || null);
          }
        } else {
          const mesaValue = serviceMode === "barra" ? "Barra" : tableNumber.trim();
          const label = serviceMode === "barra"
            ? "Barra Principal"
            : mesaValue.toLowerCase().startsWith("mesa")
            ? mesaValue
            : `Mesa ${mesaValue}`;

          const url = buildQrTargetUrl({
            baseUrl,
            targetMode,
            tenantSlug,
            mesa: mesaValue,
          });

          const svg = await QRCode.toString(url, {
            type: "svg",
            margin: 1,
            color: {
              dark: "#000000",
              light: "#ffffff",
            },
          });

          if (!isCancelled) {
            setActiveQr({ label, mesaValue, url, svg });
          }
        }
      } catch (err) {
        console.error("Error generando código QR:", err);
      } finally {
        if (!isCancelled) setGenerating(false);
      }
    }

    void generate();

    return () => {
      isCancelled = true;
    };
  }, [
    baseUrl,
    targetMode,
    tenantSlug,
    serviceMode,
    tableNumber,
    batchStart,
    batchEnd,
    batchPrefix,
  ]);

  const handleCopy = async (url: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
      }
    } catch {
      // Fallback
    }
  };

  const handleDownloadSvg = (item: QrItem) => {
    const blob = new Blob([item.svg], { type: "image/svg+xml;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `qr-${item.label.toLowerCase().replace(/\s+/g, "-")}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const handleDownloadPng = async (item: QrItem) => {
    try {
      const dataUrl = await QRCode.toDataURL(item.url, {
        margin: 2,
        width: 800,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `qr-${item.label.toLowerCase().replace(/\s+/g, "-")}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Error descargando PNG:", err);
    }
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <Card
      data-testid="qr-generator-card"
      className="border border-slate-200 bg-white shadow-sm overflow-hidden"
    >
      <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-5 md:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pink-100 text-pink-600 border border-pink-200">
              <QrCode className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-slate-950 flex items-center gap-2">
                Generador de Códigos QR para Mesas y Barra
              </CardTitle>
              <CardDescription className="text-xs text-slate-600">
                Genera, imprime y descarga códigos QR oficiales SVG para que tus clientes pidan desde su mesa.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="min-h-[40px] text-xs font-semibold gap-1.5"
            >
              <Printer className="h-4 w-4" /> Imprimir Tarjeta{serviceMode === "lote" ? "s" : ""}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 md:p-6 space-y-6">
        {/* Controles de Configuración */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Destino de la Carta */}
          <div className="space-y-2">
            <Label htmlFor={`${id}-target-mode`} className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Destino del Código
            </Label>
            <div className="flex rounded-lg border border-slate-200 p-1 bg-slate-50">
              <button
                type="button"
                onClick={() => setTargetMode("menu")}
                className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                  targetMode === "menu"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Menú General (/menu)
              </button>
              <button
                type="button"
                onClick={() => setTargetMode("tenant")}
                className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                  targetMode === "tenant"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Local (/m/[slug])
              </button>
            </div>
          </div>

          {/* Slug del local si es tenant */}
          {targetMode === "tenant" && (
            <div className="space-y-2 animate-in fade-in duration-200">
              <Label htmlFor={`${id}-tenant-slug`} className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Slug del Local
              </Label>
              <Input
                id={`${id}-tenant-slug`}
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                placeholder="ej: la-70 o poblado"
                className="h-9 text-xs"
              />
            </div>
          )}

          {/* Modalidad de Servicio */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Tipo de Servicio
            </Label>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-200 p-1 bg-slate-50">
              <button
                type="button"
                onClick={() => setServiceMode("mesa")}
                className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                  serviceMode === "mesa"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <UtensilsCrossed className="h-3.5 w-3.5" /> Mesa
              </button>
              <button
                type="button"
                onClick={() => setServiceMode("barra")}
                className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                  serviceMode === "barra"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <GlassWater className="h-3.5 w-3.5" /> Barra
              </button>
              <button
                type="button"
                onClick={() => setServiceMode("lote")}
                className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                  serviceMode === "lote"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Layers className="h-3.5 w-3.5" /> Lote
              </button>
            </div>
          </div>

          {/* Input de Mesa Individual */}
          {serviceMode === "mesa" && (
            <div className="space-y-2 animate-in fade-in duration-200">
              <Label htmlFor={`${id}-table-number`} className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Número o Nombre de Mesa
              </Label>
              <Input
                id={`${id}-table-number`}
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                placeholder="Ej: 1, 4, VIP 2"
                className="h-9 text-xs"
              />
            </div>
          )}

          {/* Configuración Lote */}
          {serviceMode === "lote" && (
            <div className="space-y-2 animate-in fade-in duration-200 col-span-1 md:col-span-2 lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div>
                <Label htmlFor={`${id}-batch-start`} className="text-xs font-bold text-slate-700">
                  Mesa Inicial
                </Label>
                <Input
                  id={`${id}-batch-start`}
                  type="number"
                  min={1}
                  max={99}
                  value={batchStart}
                  onChange={(e) => setBatchStart(Number(e.target.value))}
                  className="h-9 text-xs bg-white"
                />
              </div>
              <div>
                <Label htmlFor={`${id}-batch-end`} className="text-xs font-bold text-slate-700">
                  Mesa Final
                </Label>
                <Input
                  id={`${id}-batch-end`}
                  type="number"
                  min={1}
                  max={100}
                  value={batchEnd}
                  onChange={(e) => setBatchEnd(Number(e.target.value))}
                  className="h-9 text-xs bg-white"
                />
              </div>
              <div>
                <Label htmlFor={`${id}-batch-prefix`} className="text-xs font-bold text-slate-700">
                  Prefijo de Tarjeta
                </Label>
                <Input
                  id={`${id}-batch-prefix`}
                  value={batchPrefix}
                  onChange={(e) => setBatchPrefix(e.target.value)}
                  placeholder="Ej: Mesa "
                  className="h-9 text-xs bg-white"
                />
              </div>
            </div>
          )}
        </div>

        {/* Estilo visual de la tarjeta imprimible */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Tema de Tarjeta:</span>
            <div className="flex rounded-md border border-slate-200 p-0.5 bg-slate-50 text-xs">
              <button
                type="button"
                onClick={() => setCardTheme("neon")}
                className={`px-3 py-1 rounded font-semibold transition-all ${
                  cardTheme === "neon"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Nocturno Neón
              </button>
              <button
                type="button"
                onClick={() => setCardTheme("print")}
                className={`px-3 py-1 rounded font-semibold transition-all ${
                  cardTheme === "print"
                    ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Impresión / Papel
              </button>
            </div>
          </div>

          {activeQr && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleCopy(activeQr.url)}
                className="text-xs min-h-[38px] gap-1.5"
              >
                {copiedUrl ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedUrl ? "¡Copiado!" : "Copiar Enlace"}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                asChild
                className="text-xs min-h-[38px] gap-1.5"
              >
                <a href={activeQr.url} target="_blank" rel="noopener noreferrer">
                  Probar Enlace <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          )}
        </div>

        {/* Vista previa de la Tarjeta o Lote de Tarjetas */}
        <div className="space-y-4">
          {serviceMode === "lote" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Lote de {batchQrs.length} Tarjetas Generadas
                </p>
                <p className="text-xs text-slate-500">
                  Listas para imprimir en hoja de acrílico o stickers
                </p>
              </div>

              <div
                id="printable-qr-batch"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              >
                {batchQrs.map((item) => (
                  <div
                    key={item.mesaValue}
                    className={`rounded-2xl border p-5 flex flex-col items-center text-center transition-all ${
                      cardTheme === "neon"
                        ? "bg-slate-950 text-white border-pink-500/40 shadow-md"
                        : "bg-white text-slate-900 border-slate-300 shadow-sm"
                    }`}
                  >
                    <div className="mb-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest border border-current opacity-80">
                      <Sparkles className="h-3 w-3" /> {storeName}
                    </div>

                    <h3
                      className={`text-xl font-black uppercase tracking-tight mb-3 ${
                        cardTheme === "neon" ? "text-pink-400" : "text-slate-900"
                      }`}
                    >
                      {item.label}
                    </h3>

                    <div
                      className="w-44 h-44 p-2 rounded-xl bg-white flex items-center justify-center shadow-inner"
                      dangerouslySetInnerHTML={{ __html: item.svg }}
                    />

                    <p className="mt-3 text-xs font-semibold leading-tight opacity-90">
                      Escanea para ver la carta y pedir
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400 break-all line-clamp-1 max-w-[200px]">
                      {item.url}
                    </p>

                    <div className="mt-4 flex items-center gap-1.5 print:hidden">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDownloadSvg(item)}
                        className="text-[11px] h-8 px-2.5 gap-1"
                      >
                        <Download className="h-3 w-3" /> SVG
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => void handleDownloadPng(item)}
                        className="text-[11px] h-8 px-2.5 gap-1"
                      >
                        <Download className="h-3 w-3" /> PNG
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : activeQr ? (
            <div className="flex flex-col items-center justify-center p-4">
              <div
                id="printable-qr-single"
                className={`w-full max-w-sm rounded-3xl border p-6 md:p-8 flex flex-col items-center text-center shadow-xl transition-all ${
                  cardTheme === "neon"
                    ? "bg-gradient-to-b from-slate-950 via-slate-900 to-black text-white border-pink-500/50 shadow-[0_0_35px_rgba(229,25,110,0.25)]"
                    : "bg-white text-slate-900 border-slate-300 shadow-md"
                }`}
              >
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest border border-current opacity-85">
                  <Sparkles className="h-3.5 w-3.5" /> {storeName}
                </div>

                <h3
                  className={`text-2xl md:text-3xl font-black uppercase tracking-tight mb-4 ${
                    cardTheme === "neon" ? "text-pink-400" : "text-slate-900"
                  }`}
                >
                  {activeQr.label}
                </h3>

                <div
                  data-testid="qr-svg-container"
                  className="w-56 h-56 p-3 rounded-2xl bg-white flex items-center justify-center shadow-inner"
                  dangerouslySetInnerHTML={{ __html: activeQr.svg }}
                />

                <p className="mt-4 text-sm font-bold leading-relaxed">
                  Escanea con la cámara de tu celular para ver la carta y pedir
                </p>
                <p className="mt-1.5 text-xs text-slate-400 break-all max-w-[280px]">
                  {activeQr.url}
                </p>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-2 print:hidden w-full">
                  <Button
                    type="button"
                    variant={cardTheme === "neon" ? "default" : "outline"}
                    onClick={() => handleDownloadSvg(activeQr)}
                    className="flex-1 min-h-[44px] text-xs font-bold gap-1.5"
                  >
                    <Download className="h-4 w-4" /> Descargar SVG
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleDownloadPng(activeQr)}
                    className="flex-1 min-h-[44px] text-xs font-bold gap-1.5"
                  >
                    <Download className="h-4 w-4" /> Descargar PNG
                  </Button>
                </div>
              </div>
            </div>
          ) : generating ? (
            <div className="flex h-64 items-center justify-center text-xs text-slate-500">
              Generando código QR...
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
