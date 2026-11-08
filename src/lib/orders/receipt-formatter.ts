import type { Order } from "@/types/orders";

export type ReceiptPaperWidth = "58mm" | "80mm";
export type ReceiptFormatType = "ticket" | "sticker";

export type ReceiptFormatOptions = {
  width?: ReceiptPaperWidth;
  storeName?: string;
  storePhone?: string;
  storeAddress?: string;
  website?: string;
  cutPaper?: boolean;
};

const COLUMN_LIMITS: Record<ReceiptPaperWidth, number> = {
  "58mm": 32,
  "80mm": 48,
};

/**
 * Normaliza caracteres especiales a ASCII puro para compatibilidad
 * con impresoras térmicas ESC/POS genéricas de 58mm / 80mm.
 */
export function sanitizeForThermalPrint(input: string): string {
  return input
    .replace(/[—–]/g, "-")
    .replace(/¡/g, "!")
    .replace(/¿/g, "?")
    .replace(/[«»“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n\r]/g, "");
}

function getLineWidth(width: ReceiptPaperWidth = "58mm"): number {
  return COLUMN_LIMITS[width] ?? 32;
}

export function centerText(text: string, width: number): string {
  const clean = text.trim();
  if (clean.length >= width) return clean.slice(0, width);
  const leftPadding = Math.floor((width - clean.length) / 2);
  const rightPadding = width - clean.length - leftPadding;
  return " ".repeat(leftPadding) + clean + " ".repeat(rightPadding);
}

export function twoColumns(left: string, right: string, width: number): string {
  const rightTrim = right.trim();
  const availableLeft = width - rightTrim.length - 1;
  if (availableLeft <= 0) return `${left}\n${right}`;

  let leftTrim = left.trim();
  if (leftTrim.length > availableLeft) {
    leftTrim = leftTrim.slice(0, availableLeft);
  }

  const space = width - leftTrim.length - rightTrim.length;
  return leftTrim + " ".repeat(Math.max(1, space)) + rightTrim;
}

export function divider(char: string = "-", width: number = 32): string {
  return char.repeat(width);
}

export function getReceiptServiceLabel(order: Order): string {
  if (order.serviceType === "mesa" || order.tableNumber || order.address.toLowerCase().includes("mesa")) {
    const table = order.tableNumber
      ? order.tableNumber.toLowerCase().startsWith("mesa")
        ? order.tableNumber
        : `Mesa ${order.tableNumber}`
      : "Mesa";
    return `MESA (${table.toUpperCase()})`;
  }
  if (order.serviceType === "pickup" || order.address.toLowerCase().includes("barra")) {
    return "EN BARRA (PICKUP)";
  }
  return "DOMICILIO";
}

export function getTotalCupCount(order: Order): number {
  return order.items.reduce((acc, item) => acc + (item.quantity || 1), 0);
}

export function getReceiptOrderCode(orderId: string): string {
  const clean = orderId.replace(/^ord-/, "");
  return clean.toUpperCase();
}

/**
 * Formatea una comanda completa de cocina/barra para impresora térmica (58mm o 80mm).
 */
export function formatOrderReceiptText(
  order: Order,
  options: ReceiptFormatOptions = {},
): string {
  const widthMode = options.width ?? "58mm";
  const cols = getLineWidth(widthMode);
  const storeName = options.storeName ?? "COCTELS OPS";
  const storePhone = options.storePhone ?? "300 000 0000";
  const website = options.website ?? "coctelsops.com";

  const lines: string[] = [];

  // Encabezado del negocio
  lines.push(divider("=", cols));
  lines.push(centerText(storeName, cols));
  lines.push(centerText("Granizados & Cocteleria", cols));
  lines.push(centerText(`Tel: ${storePhone}`, cols));
  lines.push(divider("=", cols));

  // Metadatos de la orden
  const serviceLabel = getReceiptServiceLabel(order);
  const dateFormatted = new Date(order.createdAt).toLocaleString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  lines.push(twoColumns(`PEDIDO: #${getReceiptOrderCode(order.id)}`, serviceLabel, cols));
  lines.push(twoColumns("FECHA:", dateFormatted, cols));
  lines.push(twoColumns("ESTADO:", order.status.toUpperCase(), cols));

  lines.push(divider("-", cols));
  lines.push(centerText("DATOS DEL CLIENTE", cols));
  lines.push(`Cliente: ${order.customerName}`);
  lines.push(`Tel: ${order.phone}`);
  if (order.address) {
    lines.push(`Dir: ${order.address}`);
  }

  // Desglose de productos / receta de preparación
  lines.push(divider("-", cols));
  lines.push(twoColumns("CANT PRODUCTO", "TOTAL", cols));
  lines.push(divider("-", cols));

  for (const item of order.items) {
    const qtyName = `${item.quantity}x ${item.name}`;
    const priceStr = `$${item.subtotal.toLocaleString("es-CO")}`;
    lines.push(twoColumns(qtyName, priceStr, cols));

    if (item.customization.size) {
      lines.push(`   Tam: ${item.customization.size}`);
    }
    if (item.customization.flavors.length > 0) {
      lines.push(`   Sabores: ${item.customization.flavors.join(", ")}`);
    }
    if (item.customization.addOns.length > 0) {
      lines.push(`   Toppings: ${item.customization.addOns.join(", ")}`);
    }
  }

  // Totales financieros
  lines.push(divider("-", cols));
  lines.push(twoColumns("Subtotal:", `$${order.subtotal.toLocaleString("es-CO")}`, cols));

  if (order.promotionCode) {
    const discount = order.subtotal - order.total;
    if (discount > 0) {
      lines.push(twoColumns(`Desc (${order.promotionCode}):`, `-$${discount.toLocaleString("es-CO")}`, cols));
    }
  }

  if (order.loyaltyDiscount && order.loyaltyDiscount > 0) {
    lines.push(twoColumns("Puntos Coctels:", `-$${order.loyaltyDiscount.toLocaleString("es-CO")}`, cols));
  }

  lines.push(divider("=", cols));
  lines.push(twoColumns("TOTAL A COBRAR:", `$${order.total.toLocaleString("es-CO")}`, cols));
  lines.push(divider("=", cols));

  // Notas especiales de la orden
  if (order.notes && order.notes.trim().length > 0) {
    lines.push(centerText("NOTAS / ALERGIAS:", cols));
    lines.push(order.notes.trim());
    lines.push(divider("-", cols));
  }

  // Pie de comanda
  lines.push(centerText("¡Gracias por tu preferencia!", cols));
  lines.push(centerText(website, cols));
  lines.push(divider("=", cols));

  return lines.join("\n");
}

export type ItemSticker = {
  cupIndex: number;
  totalCups: number;
  orderId: string;
  customerName: string;
  serviceLabel: string;
  productName: string;
  size: string;
  flavors: string[];
  addOns: string[];
  notes?: string;
  text: string;
};

/**
 * Formatea etiquetas adhesivas individuales por cada vaso de la orden.
 * Si un producto tiene cantidad 2, genera 2 etiquetas separadas.
 */
export function formatItemStickers(
  order: Order,
  options: ReceiptFormatOptions = {},
): ItemSticker[] {
  const widthMode = options.width ?? "58mm";
  const cols = getLineWidth(widthMode);
  const storeName = options.storeName ?? "COCTELS OPS";
  const serviceLabel = getReceiptServiceLabel(order);
  const totalCups = getTotalCupCount(order);
  const orderShortId = getReceiptOrderCode(order.id);

  const stickers: ItemSticker[] = [];
  let currentCup = 1;

  for (const item of order.items) {
    const quantity = Math.max(1, item.quantity);
    for (let q = 0; q < quantity; q++) {
      const lines: string[] = [];
      lines.push(divider("=", cols));
      lines.push(centerText(storeName, cols));
      lines.push(centerText(`VASO [${currentCup}/${totalCups}] - #${orderShortId}`, cols));
      lines.push(divider("=", cols));

      lines.push(twoColumns(`Cli: ${order.customerName}`, serviceLabel, cols));
      lines.push(divider("-", cols));

      lines.push(centerText("PRODUCTO:", cols));
      lines.push(`${item.name} (${item.customization.size})`);

      if (item.customization.flavors.length > 0) {
        lines.push("");
        lines.push("SABORES:");
        item.customization.flavors.forEach((flavor) => lines.push(`* ${flavor}`));
      }

      if (item.customization.addOns.length > 0) {
        lines.push("");
        lines.push("TOPPINGS / ADICIONES:");
        item.customization.addOns.forEach((addon) => lines.push(`* ${addon}`));
      }

      if (order.notes && order.notes.trim().length > 0) {
        lines.push(divider("-", cols));
        lines.push(`NOTA: ${order.notes.trim()}`);
      }

      lines.push(divider("=", cols));

      stickers.push({
        cupIndex: currentCup,
        totalCups,
        orderId: order.id,
        customerName: order.customerName,
        serviceLabel,
        productName: item.name,
        size: item.customization.size,
        flavors: item.customization.flavors,
        addOns: item.customization.addOns,
        notes: order.notes,
        text: lines.join("\n"),
      });

      currentCup++;
    }
  }

  return stickers;
}

/**
 * Genera bytes binarios ESC/POS estándar para impresoras térmicas
 * Bluetooth o USB (Epson, Xprinter, Netum, etc.).
 */
export function formatOrderReceiptEscPos(
  order: Order,
  options: ReceiptFormatOptions = {},
): Uint8Array {
  const plainText = formatOrderReceiptText(order, options);
  const sanitized = sanitizeForThermalPrint(plainText);

  // Comandos ESC/POS estándar:
  // ESC @ (0x1B, 0x40): Reset / Inicializar impresora
  // ESC t 0 (0x1B, 0x74, 0x00): Set code page PC437 / Estándar
  // LF (0x0A): Salto de línea
  // GS V 66 0 (0x1D, 0x56, 0x42, 0x00): Cortar papel con avance
  const headerBytes = new Uint8Array([0x1b, 0x40, 0x1b, 0x74, 0x00]);
  const textBytes = new TextEncoder().encode(sanitized + "\n\n\n");
  const cutBytes = options.cutPaper !== false
    ? new Uint8Array([0x1d, 0x56, 0x42, 0x00])
    : new Uint8Array([0x0a, 0x0a]);

  const totalLength = headerBytes.length + textBytes.length + cutBytes.length;
  const result = new Uint8Array(totalLength);

  result.set(headerBytes, 0);
  result.set(textBytes, headerBytes.length);
  result.set(cutBytes, headerBytes.length + textBytes.length);

  return result;
}
