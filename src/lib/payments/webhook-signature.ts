import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type {
  PaymentGatewayProvider,
  PaymentGatewayStatus,
  PosDigitalChannel,
} from "@/types/orders";

export class PaymentWebhookValidationError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PaymentWebhookValidationError";
    this.status = status;
  }
}

export type WebhookHeadersInput =
  | Headers
  | Readonly<Record<string, string | string[] | undefined>>;

export type SignatureVerificationResult =
  | {
      ok: true;
      method: "hmac_header" | "wompi_checksum" | "bold_base64_hmac" | "bold_raw_hmac";
    }
  | {
      ok: false;
      reason:
        | "missing_secret"
        | "missing_signature"
        | "invalid_hmac_signature"
        | "invalid_checksum"
        | "missing_checksum_properties"
        | "missing_checksum_property"
        | "invalid_timestamp";
    };

export type NormalizedPaymentWebhookEvent = {
  provider: PaymentGatewayProvider;
  eventId: string;
  transactionId: string;
  orderId: string;
  status: PaymentGatewayStatus;
  rawStatus: string;
  amountCop: number;
  tipAmountCop?: number;
  currency: string;
  digitalChannel: PosDigitalChannel;
  confirmedAt: string;
};

const FORBIDDEN_PATH_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);
const REQUIRED_WOMPI_PROPERTIES = [
  "transaction.id",
  "transaction.status",
  "transaction.amount_in_cents",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getHeader(headers: WebhookHeadersInput, name: string): string | undefined {
  const lowerTarget = name.toLowerCase();
  if (typeof (headers as Headers).get === "function") {
    const val = (headers as Headers).get(name) ?? (headers as Headers).get(lowerTarget);
    return typeof val === "string" && val.trim() ? val.trim() : undefined;
  }

  const record = headers as Readonly<Record<string, string | string[] | undefined>>;
  for (const [key, value] of Object.entries(record)) {
    if (key.toLowerCase() !== lowerTarget) continue;
    if (Array.isArray(value)) {
      const first = value.find((item) => typeof item === "string" && item.trim());
      return first?.trim();
    }
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

export function computeHmacSha256Hex(payload: string | Buffer, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function timingSafeEqualHex(expectedHex: string, receivedHex: string): boolean {
  const cleanExpected = expectedHex.trim().replace(/^sha256=/i, "");
  const cleanReceived = receivedHex.trim().replace(/^sha256=/i, "");

  if (!cleanExpected || !cleanReceived) return false;
  if (cleanExpected.length % 2 !== 0 || cleanReceived.length % 2 !== 0) return false;
  if (!/^[0-9a-f]+$/i.test(cleanExpected) || !/^[0-9a-f]+$/i.test(cleanReceived)) {
    return false;
  }

  const expectedBuffer = Buffer.from(cleanExpected.toLowerCase(), "hex");
  const receivedBuffer = Buffer.from(cleanReceived.toLowerCase(), "hex");

  if (expectedBuffer.length !== receivedBuffer.length || expectedBuffer.length === 0) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

function resolveWompiPropertyValue(data: Record<string, unknown>, path: string): unknown {
  const segments = path.split(".");
  let current: unknown = data;
  for (const segment of segments) {
    if (!segment || FORBIDDEN_PATH_SEGMENTS.has(segment)) {
      return undefined;
    }
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

export function computeWompiEventChecksum(
  payload: Record<string, unknown>,
  secret: string,
): { ok: true; checksum: string } | { ok: false; reason: "missing_checksum_properties" | "missing_checksum_property" | "invalid_timestamp" } {
  const signature = isRecord(payload.signature) ? payload.signature : null;
  const properties = signature && Array.isArray(signature.properties)
    ? signature.properties.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  if (properties.length === 0) {
    return { ok: false, reason: "missing_checksum_properties" };
  }

  for (const requiredProp of REQUIRED_WOMPI_PROPERTIES) {
    if (!properties.includes(requiredProp)) {
      return { ok: false, reason: "missing_checksum_properties" };
    }
  }

  const rawTimestamp = payload.timestamp;
  let timestampStr = "";
  if (typeof rawTimestamp === "number" && Number.isFinite(rawTimestamp)) {
    timestampStr = String(rawTimestamp);
  } else if (typeof rawTimestamp === "string" && /^\d+$/.test(rawTimestamp.trim())) {
    timestampStr = rawTimestamp.trim();
  } else {
    return { ok: false, reason: "invalid_timestamp" };
  }

  const data = isRecord(payload.data) ? payload.data : null;
  if (!data) {
    return { ok: false, reason: "missing_checksum_property" };
  }

  const parts: string[] = [];
  for (const prop of properties) {
    const val = resolveWompiPropertyValue(data, prop);
    if (
      val === undefined ||
      val === null ||
      (typeof val !== "string" && typeof val !== "number" && typeof val !== "boolean")
    ) {
      return { ok: false, reason: "missing_checksum_property" };
    }
    parts.push(String(val));
  }

  const concatenated = `${parts.join("")}${timestampStr}${secret}`;
  const checksum = createHash("sha256").update(concatenated, "utf8").digest("hex");
  return { ok: true, checksum };
}

export function verifyWompiWebhookSignature(input: {
  rawBody: string;
  payload: Record<string, unknown>;
  headers: WebhookHeadersInput;
  secret?: string;
}): SignatureVerificationResult {
  const secret = input.secret?.trim() ?? "";
  if (!secret) {
    return { ok: false, reason: "missing_secret" };
  }

  const hmacHeader = getHeader(input.headers, "x-wompi-signature");
  if (hmacHeader) {
    const expected = computeHmacSha256Hex(input.rawBody, secret);
    if (!timingSafeEqualHex(expected, hmacHeader)) {
      return { ok: false, reason: "invalid_hmac_signature" };
    }
    return { ok: true, method: "hmac_header" };
  }

  const headerChecksum = getHeader(input.headers, "x-event-checksum");
  const signatureObj = isRecord(input.payload.signature) ? input.payload.signature : null;
  const bodyChecksum =
    signatureObj && typeof signatureObj.checksum === "string" && signatureObj.checksum.trim()
      ? signatureObj.checksum.trim()
      : undefined;

  if (!headerChecksum && !bodyChecksum) {
    return { ok: false, reason: "missing_signature" };
  }

  const computed = computeWompiEventChecksum(input.payload, secret);
  if (!computed.ok) {
    return { ok: false, reason: computed.reason };
  }

  if (headerChecksum && !timingSafeEqualHex(computed.checksum, headerChecksum)) {
    return { ok: false, reason: "invalid_checksum" };
  }

  if (bodyChecksum && !timingSafeEqualHex(computed.checksum, bodyChecksum)) {
    return { ok: false, reason: "invalid_checksum" };
  }

  return { ok: true, method: "wompi_checksum" };
}

export function verifyBoldWebhookSignature(input: {
  rawBody: string;
  headers: WebhookHeadersInput;
  secret?: string;
}): SignatureVerificationResult {
  const secret = input.secret?.trim() ?? "";
  if (!secret) {
    return { ok: false, reason: "missing_secret" };
  }

  const received = getHeader(input.headers, "x-bold-signature");
  if (!received) {
    return { ok: false, reason: "missing_signature" };
  }

  const base64Body = Buffer.from(input.rawBody, "utf8").toString("base64");
  const expectedBase64 = computeHmacSha256Hex(base64Body, secret);
  if (timingSafeEqualHex(expectedBase64, received)) {
    return { ok: true, method: "bold_base64_hmac" };
  }

  const expectedRaw = computeHmacSha256Hex(input.rawBody, secret);
  if (timingSafeEqualHex(expectedRaw, received)) {
    return { ok: true, method: "bold_raw_hmac" };
  }

  return { ok: false, reason: "invalid_hmac_signature" };
}

export function verifyPaymentWebhookSignature(input: {
  provider: PaymentGatewayProvider;
  rawBody: string;
  payload: Record<string, unknown>;
  headers: WebhookHeadersInput;
  secret?: string;
}): SignatureVerificationResult {
  if (input.provider === "wompi") {
    return verifyWompiWebhookSignature(input);
  }
  return verifyBoldWebhookSignature(input);
}

export function detectPaymentWebhookProvider(
  headers: WebhookHeadersInput,
  payload: Record<string, unknown>,
  queryProvider?: string | null,
): PaymentGatewayProvider | null {
  if (queryProvider && queryProvider.trim()) {
    const normalized = queryProvider.trim().toLowerCase();
    if (normalized === "wompi" || normalized === "bold") {
      return normalized;
    }
    return null;
  }

  const headerProvider = getHeader(headers, "x-payment-provider");
  if (headerProvider) {
    const normalized = headerProvider.toLowerCase();
    if (normalized === "wompi" || normalized === "bold") {
      return normalized;
    }
    return null;
  }

  if (getHeader(headers, "x-bold-signature")) {
    return "bold";
  }

  if (getHeader(headers, "x-wompi-signature") || getHeader(headers, "x-event-checksum")) {
    return "wompi";
  }

  if (payload.event === "transaction.updated") {
    return "wompi";
  }
  if (isRecord(payload.data) && isRecord(payload.data.transaction)) {
    return "wompi";
  }

  const boldType = typeof payload.type === "string" ? payload.type.trim().toUpperCase() : "";
  if (
    boldType === "SALE_APPROVED" ||
    boldType === "SALE_REJECTED" ||
    boldType === "VOID_APPROVED" ||
    boldType === "SALE_PENDING" ||
    boldType === "SALE_ERROR"
  ) {
    return "bold";
  }

  return null;
}

function extractOrderId(rawReference: unknown): string {
  if (typeof rawReference !== "string" || !rawReference.trim()) {
    throw new PaymentWebhookValidationError(422, "La referencia del pedido es obligatoria");
  }
  const clean = rawReference
    .trim()
    .replace(/^(?:coctels|ord):/i, "")
    .trim();

  if (
    !clean ||
    clean.length > 128 ||
    clean.includes("/") ||
    clean.includes("..") ||
    /\s/.test(clean)
  ) {
    throw new PaymentWebhookValidationError(422, "La referencia del pedido no es válida");
  }

  return clean;
}

function mapGatewayDigitalChannel(rawMethod: unknown): PosDigitalChannel {
  const normalized = typeof rawMethod === "string" ? rawMethod.trim().toUpperCase() : "";
  if (normalized.includes("NEQUI")) return "nequi";
  if (normalized.includes("DAVIPLATA")) return "daviplata";
  if (normalized.includes("QR")) return "qr";
  return "transferencia";
}

function parseIsoOrNow(rawDate: unknown): string {
  if (typeof rawDate === "string" && rawDate.trim()) {
    const ms = Date.parse(rawDate);
    if (Number.isFinite(ms)) {
      return new Date(ms).toISOString();
    }
  }
  return new Date().toISOString();
}

export function normalizePaymentWebhookEvent(
  provider: PaymentGatewayProvider,
  payload: Record<string, unknown>,
): NormalizedPaymentWebhookEvent {
  if (provider === "wompi") {
    const data = isRecord(payload.data) ? payload.data : null;
    const tx = data && isRecord(data.transaction) ? data.transaction : null;
    if (!tx) {
      throw new PaymentWebhookValidationError(422, "Payload de Wompi sin objeto transaction");
    }

    const transactionId = typeof tx.id === "string" ? tx.id.trim() : "";
    if (!transactionId) {
      throw new PaymentWebhookValidationError(422, "Falta el id de transacción de Wompi");
    }

    const rawStatus = typeof tx.status === "string" ? tx.status.trim().toUpperCase() : "";
    const statusMap: Record<string, PaymentGatewayStatus> = {
      APPROVED: "approved",
      DECLINED: "declined",
      VOIDED: "voided",
      ERROR: "error",
      PENDING: "pending",
    };
    const status = statusMap[rawStatus];
    if (!status) {
      throw new PaymentWebhookValidationError(422, `Estado de Wompi no soportado: ${rawStatus || "vacío"}`);
    }

    const currency = typeof tx.currency === "string" ? tx.currency.trim().toUpperCase() : "";
    if (currency !== "COP") {
      throw new PaymentWebhookValidationError(422, "Solo se aceptan pagos en moneda COP");
    }

    const amountInCents = tx.amount_in_cents;
    if (typeof amountInCents !== "number" || !Number.isFinite(amountInCents) || amountInCents <= 0) {
      throw new PaymentWebhookValidationError(422, "El monto de la transacción Wompi es inválido");
    }

    const amountCop = Math.round(amountInCents / 100);
    if (amountCop <= 0) {
      throw new PaymentWebhookValidationError(422, "El monto en COP debe ser mayor a $0");
    }

    const orderId = extractOrderId(tx.reference);
    const rawEventId =
      typeof payload.event_id === "string" && payload.event_id.trim()
        ? payload.event_id.trim()
        : typeof payload.id === "string" && payload.id.trim()
          ? payload.id.trim()
          : `${transactionId}_${rawStatus}`;

    return {
      provider: "wompi",
      eventId: rawEventId,
      transactionId,
      orderId,
      status,
      rawStatus,
      amountCop,
      currency: "COP",
      digitalChannel: mapGatewayDigitalChannel(tx.payment_method_type),
      confirmedAt: parseIsoOrNow(tx.finalized_at ?? payload.sent_at),
    };
  }

  // Bold webhook normalization
  const data = isRecord(payload.data) ? payload.data : null;
  if (!data) {
    throw new PaymentWebhookValidationError(422, "Payload de Bold sin objeto data");
  }

  const rawType =
    typeof payload.type === "string"
      ? payload.type.trim().toUpperCase()
      : typeof payload.event === "string"
        ? payload.event.trim().toUpperCase()
        : "";

  const boldStatusMap: Record<string, PaymentGatewayStatus> = {
    SALE_APPROVED: "approved",
    SALE_REJECTED: "declined",
    SALE_DECLINED: "declined",
    VOID_APPROVED: "voided",
    SALE_VOIDED: "voided",
    SALE_PENDING: "pending",
    SALE_ERROR: "error",
  };
  const status = boldStatusMap[rawType];
  if (!status) {
    throw new PaymentWebhookValidationError(422, `Evento de Bold no soportado: ${rawType || "vacío"}`);
  }

  const rawTxId =
    (typeof data.payment_id === "string" && data.payment_id.trim()) ||
    (typeof payload.subject === "string" && payload.subject.trim()) ||
    (typeof data.transaction_id === "string" && data.transaction_id.trim()) ||
    (typeof payload.id === "string" && payload.id.trim()) ||
    "";
  if (!rawTxId) {
    throw new PaymentWebhookValidationError(422, "Falta el identificador de pago de Bold");
  }

  const metadata = isRecord(data.metadata) ? data.metadata : null;
  const orderId = extractOrderId(metadata?.reference ?? data.reference);

  const rawAmountObj = isRecord(data.amount) ? data.amount : null;
  const rawCurrency =
    (rawAmountObj && typeof rawAmountObj.currency === "string" ? rawAmountObj.currency : undefined) ??
    (typeof data.currency === "string" ? data.currency : "COP");
  const currency = rawCurrency.trim().toUpperCase();
  if (currency !== "COP") {
    throw new PaymentWebhookValidationError(422, "Solo se aceptan pagos en moneda COP");
  }

  const rawTotal = rawAmountObj ? rawAmountObj.total : data.amount;
  if (typeof rawTotal !== "number" || !Number.isFinite(rawTotal) || rawTotal <= 0) {
    throw new PaymentWebhookValidationError(422, "El monto de la transacción Bold es inválido");
  }

  const amountCop = Math.round(rawTotal);
  const rawTip = rawAmountObj ? rawAmountObj.tip : data.tip;
  const tipAmountCop =
    typeof rawTip === "number" && Number.isFinite(rawTip) && rawTip >= 0
      ? Math.round(rawTip)
      : undefined;

  const rawEventId =
    typeof payload.id === "string" && payload.id.trim()
      ? payload.id.trim()
      : `${rawTxId}_${rawType}`;

  return {
    provider: "bold",
    eventId: rawEventId,
    transactionId: rawTxId,
    orderId,
    status,
    rawStatus: rawType,
    amountCop,
    ...(tipAmountCop !== undefined ? { tipAmountCop } : {}),
    currency: "COP",
    digitalChannel: mapGatewayDigitalChannel(data.payment_method),
    confirmedAt: parseIsoOrNow(payload.datetime ?? data.created_at),
  };
}
