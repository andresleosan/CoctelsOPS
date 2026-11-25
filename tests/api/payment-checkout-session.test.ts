import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getAdminDbMock, verifyRequestMock, resolvePermissionsMock } = vi.hoisted(() => ({
  getAdminDbMock: vi.fn(),
  verifyRequestMock: vi.fn(),
  resolvePermissionsMock: vi.fn(),
}));

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: getAdminDbMock,
}));

vi.mock("@/lib/auth/verify-request", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/verify-request")>();
  return {
    ...actual,
    verifyRequest: verifyRequestMock,
  };
});

vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    resolvePermissions: resolvePermissionsMock,
  };
});

import { GET, POST } from "@/app/api/payments/checkout-session/route";
import { AuthorizationError } from "@/lib/auth/verify-request";
import {
  buildOrderPaymentReference,
  computeBoldIntegritySignature,
  computeWompiIntegritySignature,
} from "@/lib/payments/checkout-session";
import { normalizePaymentWebhookEvent } from "@/lib/payments/webhook-signature";
import type { VerifiedUser } from "@/types/auth";

type StoreDoc = Record<string, Record<string, unknown>>;

function createMemoryFirestore(initial?: Record<string, StoreDoc>) {
  const stores: Record<string, StoreDoc> = {
    pedidos: { ...(initial?.pedidos ?? {}) },
    auditoria: { ...(initial?.auditoria ?? {}) },
  };
  let autoId = 0;

  const makeDocRef = (colName: string, docId: string) => ({
    id: docId,
    async get() {
      const data = stores[colName]?.[docId];
      return {
        id: docId,
        exists: Boolean(data),
        data: () => (data ? structuredClone(data) : undefined),
      };
    },
    async set(data: Record<string, unknown>) {
      if (!stores[colName]) stores[colName] = {};
      stores[colName][docId] = structuredClone(data);
    },
  });

  return {
    stores,
    db: {
      collection(name: string) {
        return {
          doc(id?: string) {
            return makeDocRef(name, id ?? `${name}-${++autoId}`);
          },
          async add(data: Record<string, unknown>) {
            const docId = `${name}-${++autoId}`;
            await makeDocRef(name, docId).set(data);
            return makeDocRef(name, docId);
          },
        };
      },
    },
  };
}

function makeCustomerUser(uid: string): VerifiedUser {
  return {
    uid,
    token: { uid, email: `${uid}@example.com`, email_verified: true },
    permissions: [],
    profile: {
      uid,
      email: `${uid}@example.com`,
      displayName: "Cliente Prueba",
      photoURL: null,
      telefono: null,
      addresses: [],
      active: true,
      accountType: "customer",
      roleIds: [],
      permissions: [],
      createdAt: "2026-11-24T00:00:00.000Z",
      lastLoginAt: "2026-11-24T00:00:00.000Z",
    },
  };
}

function makeStaffUser(uid: string, negocioId: string): VerifiedUser {
  return {
    uid,
    token: { uid, email: `${uid}@coctels.ops`, email_verified: true },
    permissions: ["pedidos.read", "pedidos.update"],
    profile: {
      uid,
      email: `${uid}@coctels.ops`,
      displayName: "Staff Barra",
      photoURL: null,
      telefono: null,
      addresses: [],
      active: true,
      accountType: "staff",
      roleIds: ["cajero"],
      permissions: ["pedidos.read", "pedidos.update"],
      negocioId,
      createdAt: "2026-11-24T00:00:00.000Z",
      lastLoginAt: "2026-11-24T00:00:00.000Z",
    },
  };
}

function makeOrderDoc(overrides: Record<string, unknown> = {}) {
  return {
    clienteUid: "cli-1",
    negocioId: "local-a",
    customerName: "Camila Restrepo",
    phone: "3001112233",
    address: "Carrera 37 # 66-36",
    items: [
      {
        productId: "fresa",
        name: "Granizado Fresa",
        quantity: 2,
        unitPrice: 15000,
        subtotal: 30000,
        customization: { size: "16 oz", flavors: ["Fresa"], addOns: [] },
      },
    ],
    subtotal: 30000,
    total: 34000,
    status: "pendiente",
    createdAt: "2026-11-25T01:00:00.000Z",
    updatedAt: "2026-11-25T01:00:00.000Z",
    audit: { createdByUid: "cli-1", createdAt: "2026-11-25T01:00:00.000Z" },
    ...overrides,
  };
}

describe("TASK-37: /api/payments/checkout-session", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.WOMPI_PUBLIC_KEY;
    delete process.env.WOMPI_INTEGRITY_SECRET;
    delete process.env.BOLD_API_KEY;
    delete process.env.BOLD_SECRET_KEY;
    delete process.env.BOLD_SANDBOX;
    delete process.env.NEXT_PUBLIC_APP_URL;
    resolvePermissionsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("GET retorna gateways vacío si no hay credenciales y lista pasarelas configuradas sin exponer secretos", async () => {
    const emptyRes = await GET();
    expect(emptyRes.status).toBe(200);
    await expect(emptyRes.json()).resolves.toEqual({ gateways: [] });

    process.env.WOMPI_PUBLIC_KEY = "pub_test_123456";
    process.env.WOMPI_INTEGRITY_SECRET = "test_integrity_super_secret";
    process.env.BOLD_API_KEY = "live_bold_api_key_abc";
    process.env.BOLD_SECRET_KEY = "bold_secret_super_secret";

    const configuredRes = await GET();
    expect(configuredRes.status).toBe(200);
    const body = (await configuredRes.json()) as {
      gateways: Array<{ provider: string; label: string; mode: string }>;
    };
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("test_integrity_super_secret");
    expect(serialized).not.toContain("bold_secret_super_secret");
    expect(serialized).not.toContain("pub_test_123456");
    expect(serialized).not.toContain("live_bold_api_key_abc");
    expect(body.gateways).toEqual([
      {
        provider: "wompi",
        label: "Wompi",
        subtitle: "Tarjeta, PSE, Nequi o Bancolombia",
        mode: "test",
      },
      {
        provider: "bold",
        label: "Bold",
        subtitle: "Tarjeta, PSE o botón Bancolombia",
        mode: "live",
      },
    ]);
  });

  it("calcula firmas SHA-256 compatibles con Wompi/Bold y referencia COCTELS:<id> compatible con webhook", () => {
    const reference = buildOrderPaymentReference("ord-998");
    expect(reference).toBe("COCTELS:ord-998");

    const expectedWompi = createHash("sha256")
      .update("COCTELS:ord-9983400000COPwompi_int_sec", "utf8")
      .digest("hex");
    expect(
      computeWompiIntegritySignature({
        reference,
        amountInCents: 3400000,
        currency: "COP",
        integritySecret: "wompi_int_sec",
      }),
    ).toBe(expectedWompi);

    const expectedBold = createHash("sha256")
      .update("COCTELS:ord-99834000COPbold_sec", "utf8")
      .digest("hex");
    expect(
      computeBoldIntegritySignature({
        reference,
        amountCop: 34000,
        currency: "COP",
        secretKey: "bold_sec",
      }),
    ).toBe(expectedBold);

    const normalized = normalizePaymentWebhookEvent("wompi", {
      event: "transaction.updated",
      event_id: "evt-1",
      data: {
        transaction: {
          id: "tx-1",
          reference,
          amount_in_cents: 3400000,
          currency: "COP",
          status: "APPROVED",
          payment_method_type: "NEQUI",
        },
      },
    });
    expect(normalized.orderId).toBe("ord-998");
  });

  it("POST retorna 401 sin sesión, 404 si el pedido no existe y 403 para otro cliente o staff de otro negocio", async () => {
    process.env.WOMPI_PUBLIC_KEY = "pub_test_123";
    process.env.WOMPI_INTEGRITY_SECRET = "sec_test_123";
    const mem = createMemoryFirestore({
      pedidos: {
        "ord-1": makeOrderDoc({ clienteUid: "cli-1", negocioId: "local-a" }),
      },
    });
    getAdminDbMock.mockReturnValue(mem.db);

    verifyRequestMock.mockRejectedValueOnce(
      new AuthorizationError(401, "Se requiere una sesión válida"),
    );
    const unauthRes = await POST(
      new Request("https://coctelsops.vercel.app/api/payments/checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: "ord-1", provider: "wompi" }),
      }),
    );
    expect(unauthRes.status).toBe(401);

    verifyRequestMock.mockResolvedValueOnce(makeCustomerUser("cli-2"));
    const otherCustomerRes = await POST(
      new Request("https://coctelsops.vercel.app/api/payments/checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: "ord-1", provider: "wompi" }),
      }),
    );
    expect(otherCustomerRes.status).toBe(403);

    verifyRequestMock.mockResolvedValueOnce(makeStaffUser("staff-b", "local-b"));
    const otherTenantStaffRes = await POST(
      new Request("https://coctelsops.vercel.app/api/payments/checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: "ord-1", provider: "wompi" }),
      }),
    );
    expect(otherTenantStaffRes.status).toBe(403);

    verifyRequestMock.mockResolvedValueOnce(makeCustomerUser("cli-1"));
    const missingRes = await POST(
      new Request("https://coctelsops.vercel.app/api/payments/checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: "ord-inexistente", provider: "wompi" }),
      }),
    );
    expect(missingRes.status).toBe(404);
  });

  it("POST retorna 422 para pedido cancelado, 409 si ya está verificado y 503 si falta configurar la pasarela", async () => {
    const mem = createMemoryFirestore({
      pedidos: {
        "ord-cancelled": makeOrderDoc({ status: "cancelado" }),
        "ord-verified": makeOrderDoc({ paymentVerificationStatus: "verificado" }),
        "ord-open": makeOrderDoc(),
      },
    });
    getAdminDbMock.mockReturnValue(mem.db);

    verifyRequestMock.mockResolvedValue(makeCustomerUser("cli-1"));
    process.env.WOMPI_PUBLIC_KEY = "pub_test_123";
    process.env.WOMPI_INTEGRITY_SECRET = "sec_test_123";

    const cancelledRes = await POST(
      new Request("https://coctelsops.vercel.app/api/payments/checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: "ord-cancelled", provider: "wompi" }),
      }),
    );
    expect(cancelledRes.status).toBe(422);

    const verifiedRes = await POST(
      new Request("https://coctelsops.vercel.app/api/payments/checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: "ord-verified", provider: "wompi" }),
      }),
    );
    expect(verifiedRes.status).toBe(409);

    const unconfiguredBoldRes = await POST(
      new Request("https://coctelsops.vercel.app/api/payments/checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: "ord-open", provider: "bold" }),
      }),
    );
    expect(unconfiguredBoldRes.status).toBe(503);
  });

  it("POST genera sesión firmada Wompi y Bold desde el total en Firestore, evita open-redirect y registra auditoría sin secretos", async () => {
    process.env.WOMPI_PUBLIC_KEY = "pub_test_wompi_abc";
    process.env.WOMPI_INTEGRITY_SECRET = "wompi_secret_private";
    process.env.BOLD_API_KEY = "test_bold_api_xyz";
    process.env.BOLD_SECRET_KEY = "bold_secret_private";
    process.env.NEXT_PUBLIC_APP_URL = "https://coctelsops.vercel.app";

    const mem = createMemoryFirestore({
      pedidos: {
        "ord-active-1": makeOrderDoc({ total: 42000 }),
      },
    });
    getAdminDbMock.mockReturnValue(mem.db);
    verifyRequestMock.mockResolvedValue(makeCustomerUser("cli-1"));

    // Incluso si el cliente intenta inyectar amountCop o redirectUrl en el body, el servidor los ignora
    const wompiRes = await POST(
      new Request("http://127.0.0.1:9002/api/payments/checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderId: "ord-active-1",
          provider: "wompi",
          amountCop: 100,
          redirectUrl: "https://evil.example.com",
        }),
      }),
    );
    expect(wompiRes.status).toBe(201);
    const wompiBody = (await wompiRes.json()) as {
      session: {
        provider: string;
        mode: string;
        amountCop: number;
        amountInCents: number;
        reference: string;
        integritySignature: string;
        redirectUrl: string;
        checkoutUrl: string;
      };
    };

    expect(wompiBody.session.provider).toBe("wompi");
    expect(wompiBody.session.mode).toBe("test");
    expect(wompiBody.session.amountCop).toBe(42000);
    expect(wompiBody.session.amountInCents).toBe(4200000);
    expect(wompiBody.session.reference).toBe("COCTELS:ord-active-1");
    expect(wompiBody.session.redirectUrl).toBe(
      "https://coctelsops.vercel.app/order-status/ord-active-1?paymentReturn=1&provider=wompi&reference=COCTELS%3Aord-active-1",
    );

    const parsedWompiUrl = new URL(wompiBody.session.checkoutUrl);
    expect(parsedWompiUrl.origin).toBe("https://checkout.wompi.co");
    expect(parsedWompiUrl.searchParams.get("amount-in-cents")).toBe("4200000");
    expect(parsedWompiUrl.searchParams.get("currency")).toBe("COP");
    expect(parsedWompiUrl.searchParams.get("reference")).toBe("COCTELS:ord-active-1");
    expect(parsedWompiUrl.searchParams.get("signature:integrity")).toBe(
      computeWompiIntegritySignature({
        reference: "COCTELS:ord-active-1",
        amountInCents: 4200000,
        currency: "COP",
        integritySecret: "wompi_secret_private",
      }),
    );
    expect(JSON.stringify(wompiBody)).not.toContain("wompi_secret_private");

    // Staff del mismo tenant también puede generar enlace de cobro Bold
    verifyRequestMock.mockResolvedValueOnce(makeStaffUser("staff-a", "local-a"));
    const boldRes = await POST(
      new Request("https://coctelsops.vercel.app/api/payments/checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: "ord-active-1", provider: "bold" }),
      }),
    );
    expect(boldRes.status).toBe(201);
    const boldBody = (await boldRes.json()) as {
      session: {
        provider: string;
        amountCop: number;
        integritySignature: string;
        checkoutUrl: string;
      };
    };
    const parsedBoldUrl = new URL(boldBody.session.checkoutUrl);
    expect(parsedBoldUrl.origin).toBe("https://checkout.bold.co");
    expect(parsedBoldUrl.searchParams.get("amount")).toBe("42000");
    expect(parsedBoldUrl.searchParams.get("order-id")).toBe("COCTELS:ord-active-1");
    expect(parsedBoldUrl.searchParams.get("integrity-signature")).toBe(
      computeBoldIntegritySignature({
        reference: "COCTELS:ord-active-1",
        amountCop: 42000,
        currency: "COP",
        secretKey: "bold_secret_private",
      }),
    );
    expect(JSON.stringify(boldBody)).not.toContain("bold_secret_private");

    const auditEntries = Object.values(mem.stores.auditoria);
    expect(auditEntries).toHaveLength(2);
    expect(auditEntries[0]).toMatchObject({
      action: "initiate_online_payment",
      module: "pedidos",
      entityId: "ord-active-1",
    });
    expect(JSON.stringify(auditEntries)).not.toContain("wompi_secret_private");
    expect(JSON.stringify(auditEntries)).not.toContain("bold_secret_private");
  });
});
