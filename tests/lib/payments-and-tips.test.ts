import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getAdminDbMock } = vi.hoisted(() => ({
  getAdminDbMock: vi.fn(),
}));

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: getAdminDbMock,
}));

import { POST as WEBHOOK_POST } from "@/app/api/webhooks/payments/route";
import { AuthorizationError } from "@/lib/auth/verify-request";
import {
  aggregateShiftStaffSettlements,
  calculateCashReconciliation,
  calculateOrderPaymentChannels,
  calculateStaffTipsDistribution,
  sumCashTips,
} from "@/lib/cash-register/calculator";
import { addCashTip, closeCashShift } from "@/lib/firestore/cash-register";
import { toCustomerOrder } from "@/lib/orders/customer-order";
import {
  computeWompiEventChecksum,
  normalizePaymentWebhookEvent,
  timingSafeEqualHex,
  verifyBoldWebhookSignature,
  verifyWompiWebhookSignature,
} from "@/lib/payments/webhook-signature";
import {
  buildShiftClosingWhatsAppMessage,
  generateOrderReportCsv,
} from "@/lib/reports/export-report";
import { cashRegisterActionSchema } from "@/lib/validation/cash-register";
import type { VerifiedUser } from "@/types/auth";
import type { CashShift } from "@/types/cash-register";
import type { OrderReport } from "@/types/operations";
import type { Order } from "@/types/orders";

type StoreDoc = Record<string, Record<string, unknown>>;

function createMemoryFirestore(initial?: Record<string, StoreDoc>) {
  const stores: Record<string, StoreDoc> = {
    pedidos: { ...(initial?.pedidos ?? {}) },
    payment_webhook_events: { ...(initial?.payment_webhook_events ?? {}) },
    notificaciones: { ...(initial?.notificaciones ?? {}) },
    auditoria: { ...(initial?.auditoria ?? {}) },
    caja_turnos: { ...(initial?.caja_turnos ?? {}) },
  };
  let autoId = 0;

  type QueryFilter = { field: string; op: string; value: unknown };

  function makeDocRef(colName: string, docId: string) {
    return {
      id: docId,
      path: `${colName}/${docId}`,
      async get() {
        const record = stores[colName]?.[docId];
        return {
          id: docId,
          exists: Boolean(record),
          data: () => (record ? structuredClone(record) : undefined),
        };
      },
      async set(data: Record<string, unknown>) {
        if (!stores[colName]) stores[colName] = {};
        stores[colName][docId] = structuredClone(data);
      },
      async create(data: Record<string, unknown>) {
        if (!stores[colName]) stores[colName] = {};
        stores[colName][docId] = structuredClone(data);
      },
      async update(data: Record<string, unknown>) {
        if (!stores[colName]?.[docId]) throw new Error(`Missing doc ${colName}/${docId}`);
        stores[colName][docId] = { ...stores[colName][docId], ...structuredClone(data) };
      },
    };
  }

  function makeQuery(
    colName: string,
    filters: QueryFilter[] = [],
    sortSpec?: { field: string; dir: "asc" | "desc" },
    limitCount?: number,
  ) {
    return {
      where(field: string, op: string, value: unknown) {
        return makeQuery(colName, [...filters, { field, op, value }], sortSpec, limitCount);
      },
      orderBy(field: string, dir: "asc" | "desc" = "asc") {
        return makeQuery(colName, filters, { field, dir }, limitCount);
      },
      limit(count: number) {
        return makeQuery(colName, filters, sortSpec, count);
      },
      async get() {
        let entries = Object.entries(stores[colName] ?? {}).filter(([, data]) =>
          filters.every(({ field, op, value }) => {
            const actual = data[field];
            if (op === "==") return actual === value;
            if (op === ">=") return typeof actual === "string" && typeof value === "string" && actual >= value;
            return false;
          }),
        );

        if (sortSpec) {
          entries = [...entries].sort(([, a], [, b]) => {
            const left = String(a[sortSpec.field] ?? "");
            const right = String(b[sortSpec.field] ?? "");
            return sortSpec.dir === "desc" ? right.localeCompare(left) : left.localeCompare(right);
          });
        }

        if (typeof limitCount === "number") {
          entries = entries.slice(0, limitCount);
        }

        const docs = entries.map(([id, data]) => ({
          id,
          ref: makeDocRef(colName, id),
          exists: true,
          data: () => structuredClone(data),
        }));

        return {
          docs,
          empty: docs.length === 0,
          size: docs.length,
        };
      },
    };
  }

  const db = {
    collection(name: string) {
      return {
        ...makeQuery(name),
        doc(id?: string) {
          const docId = id ?? `${name}-auto-${++autoId}`;
          return makeDocRef(name, docId);
        },
        async add(data: Record<string, unknown>) {
          const docId = `${name}-auto-${++autoId}`;
          await makeDocRef(name, docId).set(data);
          return makeDocRef(name, docId);
        },
      };
    },
    async runTransaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
      const stagedWrites: Array<() => void> = [];
      let sawWrite = false;
      const tx = {
        async get(target: { get: () => Promise<unknown> }) {
          if (sawWrite) {
            throw new Error("Firestore transaction invariant violated: read after write");
          }
          return target.get();
        },
        update(
          ref: { update: (d: Record<string, unknown>) => Promise<void> },
          data: Record<string, unknown>,
        ) {
          sawWrite = true;
          stagedWrites.push(() => {
            void ref.update(data);
          });
        },
        create(
          ref: { set: (d: Record<string, unknown>) => Promise<void> },
          data: Record<string, unknown>,
        ) {
          sawWrite = true;
          stagedWrites.push(() => {
            void ref.set(data);
          });
        },
        set(
          ref: { set: (d: Record<string, unknown>) => Promise<void> },
          data: Record<string, unknown>,
        ) {
          sawWrite = true;
          stagedWrites.push(() => {
            void ref.set(data);
          });
        },
      };

      const result = await callback(tx);
      for (const apply of stagedWrites) apply();
      return result;
    },
  };

  return { db, stores };
}

function makeStaffUser(uid: string, negocioId = "local-a"): VerifiedUser {
  return {
    uid,
    token: { uid, email: `${uid}@coctels.ops`, email_verified: true },
    permissions: ["pedidos.read", "pedidos.update"],
    profile: {
      uid,
      email: `${uid}@coctels.ops`,
      displayName: "Cajero Barra",
      photoURL: null,
      telefono: null,
      addresses: [],
      active: true,
      accountType: "staff",
      roleIds: ["cajero"],
      permissions: ["pedidos.read", "pedidos.update"],
      negocioId,
      createdAt: "2026-11-01T00:00:00.000Z",
      lastLoginAt: "2026-11-01T00:00:00.000Z",
    },
  };
}

function buildWompiPayload(overrides?: {
  txId?: string;
  reference?: string;
  amountInCents?: number;
  status?: string;
  currency?: string;
  method?: string;
  properties?: string[];
  secretForChecksum?: string;
}) {
  const txId = overrides?.txId ?? "wompi-tx-1001";
  const status = overrides?.status ?? "APPROVED";
  const amountInCents = overrides?.amountInCents ?? 4500000;
  const timestamp = 1764028800;
  const properties = overrides?.properties ?? [
    "transaction.id",
    "transaction.status",
    "transaction.amount_in_cents",
  ];

  const data = {
    transaction: {
      id: txId,
      reference: overrides?.reference ?? "COCTELS:ord-1",
      amount_in_cents: amountInCents,
      currency: overrides?.currency ?? "COP",
      status,
      payment_method_type: overrides?.method ?? "NEQUI",
      finalized_at: "2026-11-24T20:00:00.000Z",
    },
  };

  const payload: Record<string, unknown> = {
    event: "transaction.updated",
    event_id: `evt-${txId}-${status}`,
    timestamp,
    data,
    signature: {
      properties,
      checksum: "",
    },
  };

  if (overrides?.secretForChecksum) {
    const computed = computeWompiEventChecksum(payload, overrides.secretForChecksum);
    if (computed.ok) {
      (payload.signature as Record<string, unknown>).checksum = computed.checksum;
    }
  }

  return payload;
}

describe("TASK-35: Pasarela Wompi / Bold con Webhook Firmado HMAC", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WOMPI_EVENTS_SECRET = "wompi_test_secret_123";
    process.env.BOLD_WEBHOOK_SECRET = "bold_test_secret_456";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("1. Verificación criptográfica HMAC & checksum", () => {
    it("timingSafeEqualHex compara en tiempo constante, soporta prefijo sha256= y nunca falla con longitudes distintas", () => {
      const digest = createHash("sha256").update("coctels-ops").digest("hex");
      expect(timingSafeEqualHex(digest, digest.toUpperCase())).toBe(true);
      expect(timingSafeEqualHex(digest, `sha256=${digest}`)).toBe(true);
      expect(timingSafeEqualHex(digest, "abcd")).toBe(false);
      expect(timingSafeEqualHex(digest, "not-hex-zzz")).toBe(false);
      expect(timingSafeEqualHex("", digest)).toBe(false);
    });

    it("verifica Wompi por checksum oficial (properties + timestamp + secret) y rechaza alteraciones", () => {
      const secret = "wompi_test_secret_123";
      const payload = buildWompiPayload({ secretForChecksum: secret });
      const rawBody = JSON.stringify(payload);
      const checksum = (payload.signature as { checksum: string }).checksum;

      const ok = verifyWompiWebhookSignature({
        rawBody,
        payload,
        headers: { "x-event-checksum": checksum },
        secret,
      });
      expect(ok).toEqual({ ok: true, method: "wompi_checksum" });

      // Tampering amount_in_cents breaks checksum
      const tampered = structuredClone(payload);
      ((tampered.data as Record<string, unknown>).transaction as Record<string, unknown>).amount_in_cents = 100;
      const tamperedCheck = verifyWompiWebhookSignature({
        rawBody: JSON.stringify(tampered),
        payload: tampered,
        headers: { "x-event-checksum": checksum },
        secret,
      });
      expect(tamperedCheck).toEqual({ ok: false, reason: "invalid_checksum" });

      // Omitting required properties from signature.properties is rejected even if checksum is supplied
      const missingPropPayload = buildWompiPayload({
        properties: ["transaction.id", "transaction.status"],
      });
      expect(
        verifyWompiWebhookSignature({
          rawBody: JSON.stringify(missingPropPayload),
          payload: missingPropPayload,
          headers: { "x-event-checksum": "a".repeat(64) },
          secret,
        }),
      ).toEqual({ ok: false, reason: "missing_checksum_properties" });
    });

    it("verifica Wompi vía header HMAC x-wompi-signature y Bold vía x-bold-signature (base64 y raw)", () => {
      const wompiSecret = "wompi_test_secret_123";
      const wompiPayload = buildWompiPayload();
      const wompiRaw = JSON.stringify(wompiPayload);
      const wompiHmac = createHmac("sha256", wompiSecret).update(wompiRaw).digest("hex");

      expect(
        verifyWompiWebhookSignature({
          rawBody: wompiRaw,
          payload: wompiPayload,
          headers: { "x-wompi-signature": wompiHmac },
          secret: wompiSecret,
        }),
      ).toEqual({ ok: true, method: "hmac_header" });

      const boldSecret = "bold_test_secret_456";
      const boldRaw = JSON.stringify({
        id: "bold-evt-1",
        type: "SALE_APPROVED",
        data: {
          payment_id: "BOLD-9988",
          amount: { total: 45000, tip: 5000, currency: "COP" },
          metadata: { reference: "ord-1" },
          payment_method: "QR_BANCOLOMBIA",
        },
      });

      const boldBase64Sig = createHmac("sha256", boldSecret)
        .update(Buffer.from(boldRaw, "utf8").toString("base64"))
        .digest("hex");
      expect(
        verifyBoldWebhookSignature({
          rawBody: boldRaw,
          headers: { "x-bold-signature": boldBase64Sig },
          secret: boldSecret,
        }),
      ).toEqual({ ok: true, method: "bold_base64_hmac" });

      const boldRawSig = `sha256=${createHmac("sha256", boldSecret).update(boldRaw).digest("hex")}`;
      expect(
        verifyBoldWebhookSignature({
          rawBody: boldRaw,
          headers: { "x-bold-signature": boldRawSig },
          secret: boldSecret,
        }),
      ).toEqual({ ok: true, method: "bold_raw_hmac" });

      expect(
        verifyBoldWebhookSignature({
          rawBody: boldRaw,
          headers: { "x-bold-signature": "0011223344" },
          secret: boldSecret,
        }),
      ).toEqual({ ok: false, reason: "invalid_hmac_signature" });
    });

    it("normaliza eventos Wompi/Bold en COP y rechaza moneda distinta de COP", () => {
      const wompiEvent = normalizePaymentWebhookEvent("wompi", buildWompiPayload());
      expect(wompiEvent).toMatchObject({
        provider: "wompi",
        orderId: "ord-1",
        amountCop: 45000,
        currency: "COP",
        status: "approved",
        digitalChannel: "nequi",
      });

      const boldEvent = normalizePaymentWebhookEvent("bold", {
        id: "evt-bold-2",
        type: "SALE_APPROVED",
        data: {
          payment_id: "PAY-777",
          amount: { total: 32000, tip: 3000, currency: "COP" },
          metadata: { reference: "ORD:ord-22" },
          payment_method: "DAVIPLATA",
        },
      });
      expect(boldEvent).toMatchObject({
        provider: "bold",
        orderId: "ord-22",
        amountCop: 32000,
        tipAmountCop: 3000,
        currency: "COP",
        status: "approved",
        digitalChannel: "daviplata",
      });

      expect(() =>
        normalizePaymentWebhookEvent("wompi", buildWompiPayload({ currency: "USD" })),
      ).toThrow("COP");
    });
  });

  describe("2. Endpoint POST /api/webhooks/payments e idempotencia transaccional", () => {
    it("falla cerrado con 503 si falta el secreto y devuelve 401 si la firma HMAC es inválida", async () => {
      const mem = createMemoryFirestore();
      getAdminDbMock.mockReturnValue(mem.db);

      delete process.env.BOLD_WEBHOOK_SECRET;
      const unconfigured = await WEBHOOK_POST(
        new Request("http://localhost/api/webhooks/payments?provider=bold", {
          method: "POST",
          headers: { "x-bold-signature": "abc" },
          body: JSON.stringify({
            id: "evt-1",
            type: "SALE_APPROVED",
            data: { payment_id: "p1", amount: { total: 20000, currency: "COP" }, reference: "ord-1" },
          }),
        }),
      );
      expect(unconfigured.status).toBe(503);

      process.env.BOLD_WEBHOOK_SECRET = "bold_test_secret_456";
      const badSig = await WEBHOOK_POST(
        new Request("http://localhost/api/webhooks/payments?provider=bold", {
          method: "POST",
          headers: { "x-bold-signature": "deadbeef" },
          body: JSON.stringify({
            id: "evt-1",
            type: "SALE_APPROVED",
            data: { payment_id: "p1", amount: { total: 20000, currency: "COP" }, reference: "ord-1" },
          }),
        }),
      );
      expect(badSig.status).toBe(401);
      expect(Object.keys(mem.stores.payment_webhook_events)).toHaveLength(0);
    });

    it("confirma automáticamente pedido pendiente con Wompi APPROVED, aplica idempotencia y oculta secretos en toCustomerOrder", async () => {
      const mem = createMemoryFirestore({
        pedidos: {
          "ord-1": {
            clienteUid: "cli-1",
            negocioId: "local-a",
            customerName: "Camila",
            phone: "3001112233",
            address: "Calle 10",
            items: [],
            subtotal: 45000,
            total: 45000,
            status: "pendiente",
            createdAt: "2026-11-24T19:50:00.000Z",
            updatedAt: "2026-11-24T19:50:00.000Z",
            audit: { createdByUid: "cli-1", createdAt: "2026-11-24T19:50:00.000Z" },
            statusHistory: [{ status: "pendiente", at: "2026-11-24T19:50:00.000Z" }],
          },
        },
      });
      getAdminDbMock.mockReturnValue(mem.db);

      const payload = buildWompiPayload({ secretForChecksum: "wompi_test_secret_123" });
      const rawBody = JSON.stringify(payload);
      const checksum = (payload.signature as { checksum: string }).checksum;

      const firstRes = await WEBHOOK_POST(
        new Request("http://localhost/api/webhooks/payments", {
          method: "POST",
          headers: { "x-event-checksum": checksum, "content-type": "application/json" },
          body: rawBody,
        }),
      );
      expect(firstRes.status).toBe(200);
      await expect(firstRes.json()).resolves.toMatchObject({
        ok: true,
        outcome: "processed",
        orderId: "ord-1",
        paymentVerificationStatus: "verificado",
        orderStatus: "confirmado",
      });

      const savedOrder = mem.stores.pedidos["ord-1"];
      expect(savedOrder.status).toBe("confirmado");
      expect(savedOrder.paymentVerificationStatus).toBe("verificado");
      expect(savedOrder.paymentMethod).toBe("nequi");
      expect(savedOrder.paymentBreakdown).toMatchObject({
        digitalAmount: 45000,
        digitalMethod: "nequi",
        digitalReference: "wompi-tx-1001",
      });
      expect(savedOrder.paymentGateway).toMatchObject({
        provider: "wompi",
        transactionId: "wompi-tx-1001",
        status: "approved",
        amountCop: 45000,
      });
      expect(Object.keys(mem.stores.notificaciones)).toHaveLength(2);
      expect(Object.keys(mem.stores.auditoria)).toHaveLength(1);

      // Customer projection omits internal eventId/transactionId
      const projected = toCustomerOrder({ id: "ord-1", ...(savedOrder as Omit<Order, "id">) });
      expect(projected.paymentGateway).toEqual({
        provider: "wompi",
        status: "approved",
        channel: "nequi",
        confirmedAt: "2026-11-24T20:00:00.000Z",
      });
      expect(projected.paymentGateway).not.toHaveProperty("transactionId");
      expect(projected.paymentGateway).not.toHaveProperty("eventId");

      // Idempotency: re-sending exact same webhook does not duplicate notifications or statusHistory
      const duplicateRes = await WEBHOOK_POST(
        new Request("http://localhost/api/webhooks/payments", {
          method: "POST",
          headers: { "x-event-checksum": checksum, "content-type": "application/json" },
          body: rawBody,
        }),
      );
      expect(duplicateRes.status).toBe(200);
      await expect(duplicateRes.json()).resolves.toMatchObject({
        ok: true,
        outcome: "duplicate",
      });
      expect(Object.keys(mem.stores.notificaciones)).toHaveLength(2);
      expect((mem.stores.pedidos["ord-1"].statusHistory as unknown[]).length).toBe(2);
    });

    it("rechaza pago si el monto recibido es menor al total del pedido y procesa Bold SALE_REJECTED / 404", async () => {
      const mem = createMemoryFirestore({
        pedidos: {
          "ord-underpaid": {
            clienteUid: "cli-2",
            negocioId: "local-a",
            customerName: "Mateo",
            phone: "3002223344",
            address: "Av 33",
            items: [],
            subtotal: 50000,
            total: 50000,
            status: "pendiente",
            createdAt: "2026-11-24T19:50:00.000Z",
            updatedAt: "2026-11-24T19:50:00.000Z",
            audit: { createdByUid: "cli-2", createdAt: "2026-11-24T19:50:00.000Z" },
          },
          "ord-prep": {
            clienteUid: "cli-3",
            negocioId: "local-a",
            customerName: "Sofía",
            phone: "3003334455",
            address: "Mesa 3",
            items: [],
            subtotal: 30000,
            total: 30000,
            status: "preparando",
            createdAt: "2026-11-24T19:50:00.000Z",
            updatedAt: "2026-11-24T19:50:00.000Z",
            audit: { createdByUid: "cli-3", createdAt: "2026-11-24T19:50:00.000Z" },
          },
        },
      });
      getAdminDbMock.mockReturnValue(mem.db);

      const underpaidBoldBody = JSON.stringify({
        id: "bold-under-1",
        type: "SALE_APPROVED",
        data: {
          payment_id: "BOLD-UNDER",
          amount: { total: 40000, currency: "COP" },
          metadata: { reference: "ord-underpaid" },
          payment_method: "PSE",
        },
      });
      const underpaidSig = createHmac("sha256", "bold_test_secret_456")
        .update(Buffer.from(underpaidBoldBody, "utf8").toString("base64"))
        .digest("hex");

      const underRes = await WEBHOOK_POST(
        new Request("http://localhost/api/webhooks/payments", {
          method: "POST",
          headers: { "x-bold-signature": underpaidSig },
          body: underpaidBoldBody,
        }),
      );
      expect(underRes.status).toBe(200);
      await expect(underRes.json()).resolves.toMatchObject({ outcome: "amount_mismatch" });
      expect(mem.stores.pedidos["ord-underpaid"].status).toBe("pendiente");
      expect(mem.stores.pedidos["ord-underpaid"].paymentVerificationStatus).toBe("rechazado");

      // Declined Bold event marks paymentVerificationStatus = rechazado
      const declinedBody = JSON.stringify({
        id: "bold-decl-1",
        type: "SALE_REJECTED",
        data: {
          payment_id: "BOLD-DECL",
          amount: { total: 30000, currency: "COP" },
          metadata: { reference: "ord-prep" },
          payment_method: "CARD",
        },
      });
      const declinedSig = createHmac("sha256", "bold_test_secret_456")
        .update(Buffer.from(declinedBody, "utf8").toString("base64"))
        .digest("hex");

      const declRes = await WEBHOOK_POST(
        new Request("http://localhost/api/webhooks/payments", {
          method: "POST",
          headers: { "x-bold-signature": declinedSig },
          body: declinedBody,
        }),
      );
      expect(declRes.status).toBe(200);
      expect(mem.stores.pedidos["ord-prep"].status).toBe("preparando");
      expect(mem.stores.pedidos["ord-prep"].paymentVerificationStatus).toBe("rechazado");

      // Non-existent order returns 404 without burning dedupe
      const missingBody = JSON.stringify({
        id: "bold-missing-1",
        type: "SALE_APPROVED",
        data: {
          payment_id: "BOLD-MISS",
          amount: { total: 30000, currency: "COP" },
          metadata: { reference: "ord-inexistente" },
          payment_method: "NEQUI",
        },
      });
      const missingSig = createHmac("sha256", "bold_test_secret_456")
        .update(Buffer.from(missingBody, "utf8").toString("base64"))
        .digest("hex");

      const missRes = await WEBHOOK_POST(
        new Request("http://localhost/api/webhooks/payments", {
          method: "POST",
          headers: { "x-bold-signature": missingSig },
          body: missingBody,
        }),
      );
      expect(missRes.status).toBe(404);
      expect(mem.stores.payment_webhook_events["bold_bold-missing-1_approved"]).toBeUndefined();
    });
  });
});

describe("TASK-35: Liquidación de Propinas, Comisiones de Staff y Cierre de Caja", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("distribuye propinas equitativas al peso COP con restos mayores (Hamilton) sin pérdida de redondeo", () => {
    const settlement = calculateStaffTipsDistribution({
      mode: "equitativo",
      cashTipsCop: 7000,
      digitalTipsCop: 3000,
      recipients: [
        { name: "Valentina", role: "bartender" },
        { name: "Andrés", role: "mesero" },
        { name: "Carlos", role: "domiciliario" },
      ],
    });

    expect(settlement.totalTipsCop).toBe(10000);
    expect(settlement.allocations.map((a) => a.tipShareCop)).toEqual([3334, 3333, 3333]);
    expect(settlement.allocations.reduce((sum, a) => sum + a.tipShareCop, 0)).toBe(10000);
  });

  it("aplica pesos por rol (50/35/15), renormaliza cuando faltan roles y suma comisiones de domiciliarios", () => {
    const withoutDrivers = calculateStaffTipsDistribution({
      mode: "ponderado_rol",
      cashTipsCop: 85000,
      digitalTipsCop: 0,
      recipients: [
        { name: "Bartender 1", role: "bartender" },
        { name: "Mesero 1", role: "mesero" },
      ],
    });
    // 50/(50+35) * 85000 = 50000; 35/(50+35) * 85000 = 35000
    expect(withoutDrivers.allocations[0].tipShareCop).toBe(50000);
    expect(withoutDrivers.allocations[1].tipShareCop).toBe(35000);

    const fullTeam = calculateStaffTipsDistribution({
      mode: "ponderado_rol",
      cashTipsCop: 60000,
      digitalTipsCop: 40000,
      recipients: [
        { name: "Laura", role: "bartender", paidFromCash: true },
        { name: "Sofía", role: "mesero", paidFromCash: true },
        {
          name: "Julián Moto",
          role: "domiciliario",
          deliveriesCount: 6,
          commissionPerDeliveryCop: 4000,
          fixedCommissionCop: 5000,
          paidFromCash: true,
        },
      ],
    });

    expect(fullTeam.totalTipsCop).toBe(100000);
    expect(fullTeam.allocations[0].tipShareCop).toBe(50000);
    expect(fullTeam.allocations[1].tipShareCop).toBe(35000);
    expect(fullTeam.allocations[2].tipShareCop).toBe(15000);
    expect(fullTeam.allocations[2].commissionCop).toBe(29000); // 6*4000 + 5000
    expect(fullTeam.allocations[2].totalPayoutCop).toBe(44000);
    expect(fullTeam.totalCommissionsCop).toBe(29000);
    expect(fullTeam.totalPayoutCop).toBe(129000);
    expect(fullTeam.paidFromCashCop).toBe(129000);
  });

  it("concilia arqueo de caja incluyendo propinas efectivo/digital y egresos de liquidación desde caja física", () => {
    const openedAt = "2026-11-24T17:00:00.000Z";
    const closedAt = "2026-11-25T02:00:00.000Z";
    const sales = calculateOrderPaymentChannels(
      [
        {
          createdAt: "2026-11-24T19:00:00.000Z",
          status: "entregado",
          total: 200000,
          paymentMethod: "efectivo",
        },
        {
          createdAt: "2026-11-24T20:00:00.000Z",
          status: "entregado",
          total: 100000,
          paymentMethod: "nequi",
        },
      ],
      openedAt,
      closedAt,
    );

    const settlement = calculateStaffTipsDistribution({
      mode: "ponderado_rol",
      cashTipsCop: 20000,
      digitalTipsCop: 15000,
      recipients: [
        { name: "Bartender", role: "bartender", paidFromCash: true },
        {
          name: "Domi",
          role: "domiciliario",
          deliveriesCount: 3,
          commissionPerDeliveryCop: 4000,
          paidFromCash: true,
        },
      ],
    });
    // paidFromCashCop = 20000 + 15000 (tips) + 12000 (commissions) = 47000
    // expectedCash = 100000 (base) + 200000 (cashSales) - 10000 (expenses) + 20000 (cashTips) - 47000 (staffCashPayouts) = 263000
    // digitalExpected = 100000 (nequi) + 15000 (digitalTips) = 115000
    const reconciliation = calculateCashReconciliation({
      openingBase: 100000,
      sales,
      expenses: [{ amount: 10000 }],
      count: { declaredCash: 263000, declaredNequi: 115000 },
      staffSettlement: settlement,
    });

    expect(reconciliation.expectedCash).toBe(263000);
    expect(reconciliation.cashDifference).toBe(0);
    expect(reconciliation.statusLabel).toBe("cuadrado");
    expect(reconciliation.digitalExpected).toBe(115000);
    expect(reconciliation.digitalDifference).toBe(0);
    expect(reconciliation.totalTips).toBe(35000);
    expect(reconciliation.totalCommissions).toBe(12000);
    expect(reconciliation.staffCashPayouts).toBe(47000);
  });

  it("valida esquemas Zod de propinas y liquidación al cierre y bloquea cross-tenant en addCashTip / closeCashShift", async () => {
    expect(
      cashRegisterActionSchema.parse({
        action: "tip",
        shiftId: "shift-a",
        amount: 5000,
        source: "digital",
        channel: "nequi",
      }),
    ).toMatchObject({ action: "tip", amount: 5000, source: "digital" });

    expect(() =>
      cashRegisterActionSchema.parse({
        action: "tip",
        shiftId: "shift-a",
        amount: 0,
        source: "efectivo",
      }),
    ).toThrow();

    const mem = createMemoryFirestore({
      caja_turnos: {
        "shift-a": {
          negocioId: "local-a",
          status: "abierta",
          openedAt: "2026-11-24T17:00:00.000Z",
          openedByUid: "staff-a",
          openedByName: "Cajero A",
          openingBase: 100000,
          expenses: [],
          tips: [],
          updatedAt: "2026-11-24T17:00:00.000Z",
        },
        "shift-b": {
          negocioId: "local-b",
          status: "abierta",
          openedAt: "2026-11-24T17:00:00.000Z",
          openedByUid: "staff-b",
          openedByName: "Cajero B",
          openingBase: 100000,
          expenses: [],
          tips: [],
          updatedAt: "2026-11-24T17:00:00.000Z",
        },
      },
      pedidos: {
        "ord-a1": {
          negocioId: "local-a",
          status: "entregado",
          total: 50000,
          paymentMethod: "efectivo",
          createdAt: "2026-11-24T18:30:00.000Z",
        },
      },
    });
    getAdminDbMock.mockReturnValue(mem.db);

    const staffA = makeStaffUser("staff-a", "local-a");
    await expect(
      addCashTip(staffA, { shiftId: "shift-b", amount: 5000, source: "efectivo" }),
    ).rejects.toThrow(AuthorizationError);

    const afterTip = await addCashTip(staffA, {
      shiftId: "shift-a",
      amount: 10000,
      source: "efectivo",
      notes: "Mesa 2",
    });
    expect(sumCashTips(afterTip.tips ?? [])).toEqual({
      cashTipsCop: 10000,
      digitalTipsCop: 0,
      totalTipsCop: 10000,
    });

    const closed = await closeCashShift(staffA, {
      shiftId: "shift-a",
      countBreakdown: { declaredCash: 145000 },
      staffSettlement: {
        mode: "equitativo",
        extraCashTips: 5000,
        recipients: [{ name: "Bartender A", role: "bartender", paidFromCash: true }],
      },
    });

    // base 100000 + cashSales 50000 + cashTips 15000 - staffCashPayouts 15000 = 150000
    // declared 145000 => cashDifference = -5000 (faltante)
    expect(closed.staffSettlement?.totalTipsCop).toBe(15000);
    expect(closed.reconciliation?.expectedCash).toBe(150000);
    expect(closed.reconciliation?.cashDifference).toBe(-5000);
    expect(closed.reconciliation?.statusLabel).toBe("faltante");

    // Aggregate for reports & export CSV/WhatsApp
    const summary = aggregateShiftStaffSettlements([closed as CashShift]);
    expect(summary).toMatchObject({
      shiftsWithSettlement: 1,
      totalTipsCop: 15000,
      totalCommissionsCop: 0,
      totalPayoutCop: 15000,
    });

    const report: OrderReport = {
      orderCount: 1,
      totalRevenue: 50000,
      cancellationCount: 0,
      revenueByStatus: { entregado: 50000 },
      topProducts: [{ name: "Fresa Salvaje", quantity: 2, revenue: 50000 }],
      topCustomers: [{ customerBucket: "Cliente 1", orders: 1, revenue: 50000 }],
      staffTipsSummary: summary,
    };

    const csv = generateOrderReportCsv(report, { generatedAt: "2026-11-24 21:00" });
    expect(csv).toContain('"LIQUIDACIÓN PROPINAS Y COMISIONES DE STAFF"');
    expect(csv).toContain('"Bartender A","bartender","1","0","15000","0","15000"');

    const wa = buildShiftClosingWhatsAppMessage(report, { generatedAt: "2026-11-24 21:00" });
    expect(wa).toContain("PROPINAS Y COMISIONES DE STAFF");
    expect(wa).toContain("$15.000");
  });
});
