import { describe, expect, it } from "vitest";

import {
  buildShiftClosingWhatsAppMessage,
  buildShiftClosingWhatsAppUrl,
  calculateAverageTicket,
  formatCurrency,
  generateOrderReportCsv,
  getPresetDateRange,
} from "@/lib/reports/export-report";
import type { OrderReport } from "@/types/operations";

const sampleReport: OrderReport = {
  orderCount: 10,
  totalRevenue: 250_000,
  cancellationCount: 1,
  revenueByStatus: {
    entregado: 230_000,
    cancelado: 20_000,
  },
  topProducts: [
    { name: "Fresa Salvaje", quantity: 8, revenue: 160_000 },
    { name: "Mango Biche, Especial", quantity: 4, revenue: 90_000 },
  ],
  topCustomers: [
    { customerBucket: "Cliente 1", orders: 3, revenue: 75_000 },
    { customerBucket: "Cliente 2", orders: 2, revenue: 50_000 },
  ],
};

const emptyReport: OrderReport = {
  orderCount: 0,
  totalRevenue: 0,
  cancellationCount: 0,
  revenueByStatus: {},
  topProducts: [],
  topCustomers: [],
};

describe("export-report: getPresetDateRange", () => {
  const fixedDate = new Date("2026-11-15T14:30:00Z");

  it("calcula el rango de 'today' con la fecha local actual", () => {
    const range = getPresetDateRange("today", fixedDate);
    const expected = `${fixedDate.getFullYear()}-${String(fixedDate.getMonth() + 1).padStart(2, "0")}-${String(fixedDate.getDate()).padStart(2, "0")}`;
    expect(range.from).toBe(expected);
    expect(range.to).toBe(expected);
  });

  it("calcula el rango de 'last7days' (hace 6 días a hoy)", () => {
    const range = getPresetDateRange("last7days", fixedDate);
    const toExpected = `${fixedDate.getFullYear()}-${String(fixedDate.getMonth() + 1).padStart(2, "0")}-${String(fixedDate.getDate()).padStart(2, "0")}`;
    expect(range.to).toBe(toExpected);
    expect(range.from).toBe("2026-11-09");
  });

  it("calcula el rango de 'thisMonth' (día 01 del mes corriente)", () => {
    const range = getPresetDateRange("thisMonth", fixedDate);
    expect(range.from).toBe("2026-11-01");
    expect(range.to).toBe("2026-11-15");
  });

  it("calcula el rango de 'all' retornando cadenas vacías", () => {
    const range = getPresetDateRange("all", fixedDate);
    expect(range.from).toBe("");
    expect(range.to).toBe("");
  });
});

describe("export-report: calculateAverageTicket & formatCurrency", () => {
  it("calcula el ticket promedio dividiendo totalRevenue / orderCount", () => {
    expect(calculateAverageTicket(sampleReport)).toBe(25_000);
  });

  it("retorna 0 si orderCount es 0, nulo o indefinido", () => {
    expect(calculateAverageTicket(emptyReport)).toBe(0);
    expect(calculateAverageTicket(null)).toBe(0);
    expect(calculateAverageTicket(undefined)).toBe(0);
    expect(calculateAverageTicket({ orderCount: 0, totalRevenue: 10_000 })).toBe(0);
  });

  it("formatea moneda en pesos colombianos", () => {
    expect(formatCurrency(25_000)).toBe("$25.000");
    expect(formatCurrency(0)).toBe("$0");
  });
});

describe("export-report: generateOrderReportCsv", () => {
  it("incluye el BOM UTF-8 (\\uFEFF) para compatibilidad con Excel", () => {
    const csv = generateOrderReportCsv(sampleReport, {
      from: "2026-11-01",
      to: "2026-11-15",
      storeName: "Coctels OPS Laureles",
      generatedAt: "2026-11-15 14:30",
    });

    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("estructura correctamente las secciones del CSV con escape de caracteres", () => {
    const csv = generateOrderReportCsv(sampleReport, {
      from: "2026-11-01",
      to: "2026-11-15",
      storeName: "Coctels OPS Laureles",
      generatedAt: "2026-11-15 14:30",
    });

    expect(csv).toContain('"REPORTE OPERATIVO - CIERRE DE CAJA","Coctels OPS Laureles"');
    expect(csv).toContain('"Período Desde","2026-11-01"');
    expect(csv).toContain('"Período Hasta","2026-11-15"');
    expect(csv).toContain('"Pedidos Totales","10"');
    expect(csv).toContain('"Ingresos Totales (COP)","250000"');
    expect(csv).toContain('"Ticket Promedio (COP)","25000"');
    expect(csv).toContain('"entregado","230000"');
    expect(csv).toContain('"cancelado","20000"');
    // Verifica escape de comas en el nombre del producto
    expect(csv).toContain('"Mango Biche, Especial","4","90000"');
    expect(csv).toContain('"Cliente 1","3","75000"');
  });

  it("maneja reportes vacíos sin errores en la generación de CSV", () => {
    const csv = generateOrderReportCsv(emptyReport);
    expect(csv).toContain('"Pedidos Totales","0"');
    expect(csv).toContain('"Ingresos Totales (COP)","0"');
    expect(csv).toContain('"Sin productos vendidos","0","0"');
  });
});

describe("export-report: buildShiftClosingWhatsAppMessage & buildShiftClosingWhatsAppUrl", () => {
  it("construye un mensaje claro y legible para WhatsApp con emojis y cifras formateadas", () => {
    const msg = buildShiftClosingWhatsAppMessage(sampleReport, {
      from: "2026-11-15",
      to: "2026-11-15",
      storeName: "Coctels OPS",
      generatedAt: "2026-11-15 22:00",
    });

    expect(msg).toContain("📊 *CIERRE DE CAJA — COCTELS OPS*");
    expect(msg).toContain("📅 *Período:* Hoy (2026-11-15)");
    expect(msg).toContain("• *Total Ingresos:* $250.000");
    expect(msg).toContain("• *Total Pedidos:* 10");
    expect(msg).toContain("• *Ticket Promedio:* $25.000");
    expect(msg).toContain("• *Cancelaciones:* 1");
    expect(msg).toContain("1. *Fresa Salvaje* · 8 und · $160.000");
    expect(msg).toContain("• Entregado: $230.000");
    expect(msg).toContain("Coctels OPS");
  });

  it("construye la URL de WhatsApp con el teléfono limpiado", () => {
    const url = buildShiftClosingWhatsAppUrl("+57 300 123 4567", "Reporte de prueba");
    expect(url).toBe("https://wa.me/573001234567?text=Reporte%20de%20prueba");
  });

  it("construye la URL estándar de WhatsApp si no se proporciona teléfono", () => {
    const url = buildShiftClosingWhatsAppUrl("", "Reporte sin número");
    expect(url).toBe("https://api.whatsapp.com/send?text=Reporte%20sin%20n%C3%BAmero");
  });
});
