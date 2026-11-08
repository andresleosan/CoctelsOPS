import type { OrderReport } from "@/types/operations";

export type PresetRange = "today" | "last7days" | "thisMonth" | "all";

/**
 * Formats a Date object to YYYY-MM-DD string using local date values.
 */
function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns preset date ranges for shift filters ("Hoy", "Últimos 7 días", "Este Mes", "Todo").
 */
export function getPresetDateRange(preset: PresetRange, now: Date = new Date()): { from: string; to: string } {
  const todayStr = toLocalDateString(now);

  switch (preset) {
    case "today":
      return { from: todayStr, to: todayStr };

    case "last7days": {
      const past = new Date(now);
      past.setDate(now.getDate() - 6);
      return { from: toLocalDateString(past), to: todayStr };
    }

    case "thisMonth": {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      return { from: `${year}-${month}-01`, to: todayStr };
    }

    case "all":
    default:
      return { from: "", to: "" };
  }
}

/**
 * Calculates Average Order Value (AOV / Ticket Promedio).
 */
export function calculateAverageTicket(report?: Pick<OrderReport, "totalRevenue" | "orderCount"> | null): number {
  if (!report || typeof report.orderCount !== "number" || report.orderCount <= 0) {
    return 0;
  }
  return Math.round(report.totalRevenue / report.orderCount);
}

/**
 * Formats a numeric amount in Colombian Pesos (COP).
 */
export function formatCurrency(amount: number): string {
  return `$${Math.round(amount).toLocaleString("es-CO")}`;
}

/**
 * Escapes a cell value for RFC-4180 compliant CSV.
 */
function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Options for generating CSV and WhatsApp summaries.
 */
export type ReportExportOptions = {
  from?: string;
  to?: string;
  storeName?: string;
  generatedAt?: string;
};

/**
 * Generates an Excel-compatible CSV string with UTF-8 BOM (\uFEFF).
 */
export function generateOrderReportCsv(report: OrderReport, options: ReportExportOptions = {}): string {
  const { from = "", to = "", storeName = "Coctels OPS", generatedAt } = options;
  const currentTimestamp = generatedAt ?? new Date().toLocaleString("es-CO");
  const averageTicket = calculateAverageTicket(report);

  const lines: string[] = [];

  // UTF-8 Byte Order Mark for Excel
  const bom = "\uFEFF";

  // Header Metadata
  lines.push(`${escapeCsvCell("REPORTE OPERATIVO - CIERRE DE CAJA")},${escapeCsvCell(storeName)}`);
  lines.push(`${escapeCsvCell("Período Desde")},${escapeCsvCell(from || "Inicio histórico")}`);
  lines.push(`${escapeCsvCell("Período Hasta")},${escapeCsvCell(to || "Cierre actual")}`);
  lines.push(`${escapeCsvCell("Fecha de Generación")},${escapeCsvCell(currentTimestamp)}`);
  lines.push("");

  // Executive Summary
  lines.push(`${escapeCsvCell("MÉTRICA")},${escapeCsvCell("VALOR")}`);
  lines.push(`${escapeCsvCell("Pedidos Totales")},${escapeCsvCell(report.orderCount)}`);
  lines.push(`${escapeCsvCell("Ingresos Totales (COP)")},${escapeCsvCell(report.totalRevenue)}`);
  lines.push(`${escapeCsvCell("Ticket Promedio (COP)")},${escapeCsvCell(averageTicket)}`);
  lines.push(`${escapeCsvCell("Pedidos Cancelados")},${escapeCsvCell(report.cancellationCount)}`);
  lines.push(`${escapeCsvCell("Clientes Únicos")},${escapeCsvCell(report.topCustomers.length)}`);
  lines.push("");

  // Revenue by Status
  lines.push(`${escapeCsvCell("INGRESOS POR ESTADO")},${escapeCsvCell("TOTAL (COP)")}`);
  const statusEntries = Object.entries(report.revenueByStatus);
  if (statusEntries.length === 0) {
    lines.push(`${escapeCsvCell("Sin registros")},${escapeCsvCell(0)}`);
  } else {
    for (const [status, revenue] of statusEntries) {
      lines.push(`${escapeCsvCell(status.replace(/_/g, " "))},${escapeCsvCell(revenue)}`);
    }
  }
  lines.push("");

  // Top Products
  lines.push(`${escapeCsvCell("PRODUCTO")},${escapeCsvCell("CANTIDAD VENDIDA")},${escapeCsvCell("INGRESOS TOTALES (COP)")}`);
  if (report.topProducts.length === 0) {
    lines.push(`${escapeCsvCell("Sin productos vendidos")},${escapeCsvCell(0)},${escapeCsvCell(0)}`);
  } else {
    for (const item of report.topProducts) {
      lines.push(`${escapeCsvCell(item.name)},${escapeCsvCell(item.quantity)},${escapeCsvCell(item.revenue)}`);
    }
  }
  lines.push("");

  // Top Customers
  lines.push(`${escapeCsvCell("SEGMENTO CLIENTE")},${escapeCsvCell("PEDIDOS")},${escapeCsvCell("INGRESOS (COP)")}`);
  if (report.topCustomers.length === 0) {
    lines.push(`${escapeCsvCell("Sin clientes registrados")},${escapeCsvCell(0)},${escapeCsvCell(0)}`);
  } else {
    for (const cust of report.topCustomers) {
      lines.push(`${escapeCsvCell(cust.customerBucket)},${escapeCsvCell(cust.orders)},${escapeCsvCell(cust.revenue)}`);
    }
  }

  return bom + lines.join("\r\n");
}

/**
 * Builds an executive shift-closing summary formatted for WhatsApp.
 */
export function buildShiftClosingWhatsAppMessage(report: OrderReport, options: ReportExportOptions = {}): string {
  const { from = "", to = "", storeName = "Coctels OPS", generatedAt } = options;
  const currentTimestamp = generatedAt ?? new Date().toLocaleString("es-CO");
  const averageTicket = calculateAverageTicket(report);

  let periodLabel = "Histórico Completo";
  if (from && to) {
    periodLabel = from === to ? `Hoy (${from})` : `${from} al ${to}`;
  } else if (from) {
    periodLabel = `Desde ${from}`;
  } else if (to) {
    periodLabel = `Hasta ${to}`;
  }

  const parts: string[] = [
    `📊 *CIERRE DE CAJA — ${storeName.toUpperCase()}*`,
    `📅 *Período:* ${periodLabel}`,
    `⏰ *Generado:* ${currentTimestamp}`,
    "",
    "💰 *RESUMEN OPERATIVO*",
    `• *Total Ingresos:* ${formatCurrency(report.totalRevenue)}`,
    `• *Total Pedidos:* ${report.orderCount}`,
    `• *Ticket Promedio:* ${formatCurrency(averageTicket)}`,
    `• *Cancelaciones:* ${report.cancellationCount}`,
    `• *Clientes:* ${report.topCustomers.length}`,
  ];

  if (report.topProducts.length > 0) {
    parts.push("");
    parts.push("🍹 *TOP PRODUCTOS VENDIDOS*");
    const topList = report.topProducts.slice(0, 5);
    topList.forEach((prod, idx) => {
      parts.push(`${idx + 1}. *${prod.name}* · ${prod.quantity} und · ${formatCurrency(prod.revenue)}`);
    });
  }

  const statusEntries = Object.entries(report.revenueByStatus);
  if (statusEntries.length > 0) {
    parts.push("");
    parts.push("💳 *INGRESOS POR ESTADO*");
    for (const [status, revenue] of statusEntries) {
      const label = status.replace(/_/g, " ");
      parts.push(`• ${label.charAt(0).toUpperCase() + label.slice(1)}: ${formatCurrency(revenue)}`);
    }
  }

  parts.push("");
  parts.push("✨ _Generado desde Coctels OPS_");

  return parts.join("\n");
}

/**
 * Constructs a WhatsApp Web / App share URL for the shift closing message.
 */
export function buildShiftClosingWhatsAppUrl(phone?: string, message: string = ""): string {
  const encoded = encodeURIComponent(message);
  const cleanPhone = (phone ?? "").replace(/\D/g, "");
  if (cleanPhone) {
    return `https://wa.me/${cleanPhone}?text=${encoded}`;
  }
  return `https://api.whatsapp.com/send?text=${encoded}`;
}

/**
 * Triggers a client-side file download of CSV content.
 */
export function downloadCsv(filename: string, content: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
