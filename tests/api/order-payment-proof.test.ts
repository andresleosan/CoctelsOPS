import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  verifyRequest,
  requirePermission,
  resolvePermissions,
  hasPermission,
  getOrderForPaymentProofUpload,
  attachOrderPaymentProof,
  updateOrderPaymentVerification,
  uploadOrderPaymentProofBytes,
  deleteOrderPaymentProof,
} = vi.hoisted(() => ({
  verifyRequest: vi.fn(),
  requirePermission: vi.fn(),
  resolvePermissions: vi.fn(),
  hasPermission: vi.fn(),
  getOrderForPaymentProofUpload: vi.fn(),
  attachOrderPaymentProof: vi.fn(),
  updateOrderPaymentVerification: vi.fn(),
  uploadOrderPaymentProofBytes: vi.fn(),
  deleteOrderPaymentProof: vi.fn(),
}));

vi.mock("@/lib/auth/verify-request", () => {
  class AuthorizationError extends Error {
    readonly status: 401 | 403 | 409;
    constructor(status: 401 | 403 | 409, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    AuthorizationError,
    verifyRequest,
    toAuthorizationResponse: (error: Error & { status?: number }) => {
      const status = typeof error.status === "number" ? error.status : 500;
      const message = status === 500 ? "No fue posible completar la solicitud" : error.message;
      return Response.json({ error: message }, { status });
    },
  };
});

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission,
  resolvePermissions,
  hasPermission,
}));

vi.mock("@/lib/catalog/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalog/storage")>()),
  uploadOrderPaymentProofBytes,
  deleteOrderPaymentProof,
}));

vi.mock("@/lib/firestore/orders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/firestore/orders")>();
  return {
    OrderNotFoundError: actual.OrderNotFoundError,
    getOrderForPaymentProofUpload,
    attachOrderPaymentProof,
    updateOrderPaymentVerification,
  };
});

import { PATCH, POST } from "@/app/api/pedidos/[id]/comprobante/route";
import { AuthorizationError } from "@/lib/auth/verify-request";
import { paymentProofImageKey, uploadPaymentProofImageBytes } from "@/lib/catalog/storage-core";
import { OrderNotFoundError } from "@/lib/firestore/orders";
import { toCustomerOrder } from "@/lib/orders/customer-order";
import type { Order } from "@/types/orders";

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

const baseCustomerUser = {
  uid: "customer-1",
  token: { uid: "customer-1", email_verified: true },
  profile: {
    uid: "customer-1",
    email: "cliente@example.com",
    displayName: "Cliente",
    photoURL: null,
    telefono: null,
    addresses: [],
    active: true,
    accountType: "customer" as const,
    roleIds: [],
    permissions: [],
    createdAt: "2026-11-24T00:00:00.000Z",
    lastLoginAt: "2026-11-24T00:00:00.000Z",
  },
  permissions: [],
};

const baseStaffUser = {
  uid: "staff-1",
  token: { uid: "staff-1", name: "Cajero Barra", email_verified: true },
  profile: {
    uid: "staff-1",
    email: "cajero@coctels.ops",
    displayName: "Cajero Barra",
    photoURL: null,
    telefono: null,
    addresses: [],
    active: true,
    accountType: "staff" as const,
    roleIds: ["cajero"],
    permissions: ["pedidos.read" as const, "pedidos.update" as const],
    createdAt: "2026-11-24T00:00:00.000Z",
    lastLoginAt: "2026-11-24T00:00:00.000Z",
  },
  permissions: ["pedidos.read" as const, "pedidos.update" as const],
};

const sampleOrder: Order = {
  id: "pedido-123",
  clienteUid: "customer-1",
  negocioId: "la-parada",
  customerName: "Ana Perez",
  phone: "3001112233",
  address: "Calle 10 # 20-30",
  items: [],
  subtotal: 30000,
  total: 30000,
  status: "pendiente",
  paymentMethod: "nequi",
  paymentVerificationStatus: "pendiente_verificacion",
  createdAt: "2026-11-24T01:00:00.000Z",
  updatedAt: "2026-11-24T01:00:00.000Z",
  audit: { createdByUid: "customer-1", createdAt: "2026-11-24T01:00:00.000Z" },
};

function requestWithProof(input: {
  file?: { body: string | Uint8Array; name: string; type: string };
  channel?: string;
  reference?: string;
}): Request {
  const formValues = new Map<string, FormDataEntryValue>();
  if (input.file) {
    const bytes =
      typeof input.file.body === "string"
        ? new TextEncoder().encode(input.file.body)
        : input.file.body;
    const uploadedFile = {
      name: input.file.name,
      type: input.file.type,
      size: bytes.byteLength,
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    } as unknown as File;
    formValues.set("comprobante", uploadedFile);
  }
  if (input.channel !== undefined) formValues.set("channel", input.channel);
  if (input.reference !== undefined) formValues.set("reference", input.reference);

  return {
    formData: async () => ({
      get: (name: string) => formValues.get(name) ?? null,
    }),
  } as unknown as Request;
}

describe("POST & PATCH /api/pedidos/[id]/comprobante", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyRequest.mockResolvedValue(baseCustomerUser);
    requirePermission.mockResolvedValue(baseStaffUser);
    resolvePermissions.mockResolvedValue([]);
    hasPermission.mockImplementation(
      (profile: { accountType?: string; permissions?: string[] }, permission: string) =>
        profile.accountType === "admin" || Boolean(profile.permissions?.includes(permission)),
    );
    getOrderForPaymentProofUpload.mockResolvedValue(sampleOrder);
    uploadOrderPaymentProofBytes.mockResolvedValue({
      key: "tenants/la-parada/payment-proofs/pedido-123/uuid-nequi.png",
      url: "https://cdn.example.com/tenants/la-parada/payment-proofs/pedido-123/uuid-nequi.png",
    });
    deleteOrderPaymentProof.mockResolvedValue(undefined);
    attachOrderPaymentProof.mockResolvedValue({
      order: {
        ...sampleOrder,
        paymentProof: {
          url: "https://cdn.example.com/tenants/la-parada/payment-proofs/pedido-123/uuid-nequi.png",
          key: "tenants/la-parada/payment-proofs/pedido-123/uuid-nequi.png",
          contentType: "image/png",
          uploadedAt: "2026-11-24T01:05:00.000Z",
          uploadedByUid: "customer-1",
          channel: "nequi",
          reference: "Ref 4421",
        },
        paymentVerificationStatus: "pendiente_verificacion",
        paymentVerification: {
          status: "pendiente_verificacion",
          updatedAt: "2026-11-24T01:05:00.000Z",
          updatedByUid: "customer-1",
        },
      },
    });
    updateOrderPaymentVerification.mockResolvedValue({
      ...sampleOrder,
      paymentVerificationStatus: "verificado",
      paymentVerification: {
        status: "verificado",
        updatedAt: "2026-11-24T01:10:00.000Z",
        updatedByUid: "staff-1",
        updatedByName: "Cajero Barra",
      },
    });
  });

  it("exige autenticación y rechaza usuarios sin propiedad del pedido antes de subir a R2", async () => {
    verifyRequest.mockRejectedValueOnce(new AuthorizationError(401, "Se requiere una sesión válida"));
    const unauth = await POST(
      requestWithProof({ file: { body: PNG_BYTES, name: "nequi.png", type: "image/png" } }),
      { params: Promise.resolve({ id: "pedido-123" }) },
    );
    expect(unauth.status).toBe(401);

    getOrderForPaymentProofUpload.mockRejectedValueOnce(
      new AuthorizationError(403, "No tienes permiso para adjuntar comprobante a este pedido"),
    );
    const forbidden = await POST(
      requestWithProof({ file: { body: PNG_BYTES, name: "nequi.png", type: "image/png" } }),
      { params: Promise.resolve({ id: "pedido-123" }) },
    );
    expect(forbidden.status).toBe(403);
    expect(uploadOrderPaymentProofBytes).not.toHaveBeenCalled();
  });

  it("devuelve 404 si el pedido no existe", async () => {
    getOrderForPaymentProofUpload.mockRejectedValueOnce(new OrderNotFoundError());
    const response = await POST(
      requestWithProof({ file: { body: PNG_BYTES, name: "nequi.png", type: "image/png" } }),
      { params: Promise.resolve({ id: "no-existe" }) },
    );
    expect(response.status).toBe(404);
    expect(uploadOrderPaymentProofBytes).not.toHaveBeenCalled();
  });

  it("rechaza archivo ausente, tipo no permitido, >5MB, traversal y bytes falsos sin subir a R2", async () => {
    const missing = await POST(requestWithProof({}), { params: Promise.resolve({ id: "pedido-123" }) });
    expect(missing.status).toBe(422);

    const unsupported = await POST(
      requestWithProof({ file: { body: "GIF89a", name: "comprobante.gif", type: "image/gif" } }),
      { params: Promise.resolve({ id: "pedido-123" }) },
    );
    expect(unsupported.status).toBe(422);

    const oversized = await POST(
      requestWithProof({
        file: {
          body: new Uint8Array(5 * 1024 * 1024 + 1),
          name: "grande.jpg",
          type: "image/jpeg",
        },
      }),
      { params: Promise.resolve({ id: "pedido-123" }) },
    );
    expect(oversized.status).toBe(413);

    const traversal = await POST(
      requestWithProof({ file: { body: JPEG_BYTES, name: "../evil.jpg", type: "image/jpeg" } }),
      { params: Promise.resolve({ id: "pedido-123" }) },
    );
    expect(traversal.status).toBe(422);

    const spoofed = await POST(
      requestWithProof({ file: { body: new Uint8Array([1, 2, 3, 4]), name: "fake.jpg", type: "image/jpeg" } }),
      { params: Promise.resolve({ id: "pedido-123" }) },
    );
    expect(spoofed.status).toBe(422);

    expect(uploadOrderPaymentProofBytes).not.toHaveBeenCalled();
  });

  it.each([
    ["JPEG", "comprobante.jpg", "image/jpeg", JPEG_BYTES],
    ["PNG", "comprobante.png", "image/png", PNG_BYTES],
    ["WebP", "comprobante.webp", "image/webp", WEBP_BYTES],
  ])("acepta magic bytes %s, sube a R2 con tenant y oculta campos internos al cliente", async (_fmt, name, type, body) => {
    const response = await POST(
      requestWithProof({
        file: { body, name, type },
        channel: "nequi",
        reference: "Ref 4421",
      }),
      { params: Promise.resolve({ id: "pedido-123" }) },
    );

    expect(response.status).toBe(201);
    expect(uploadOrderPaymentProofBytes).toHaveBeenCalledWith(
      { bytes: expect.any(Uint8Array), filename: name, contentType: type },
      "pedido-123",
      { negocioId: "la-parada" },
    );
    expect(attachOrderPaymentProof).toHaveBeenCalledWith(
      baseCustomerUser,
      "pedido-123",
      expect.objectContaining({
        contentType: type,
        channel: "nequi",
        reference: "Ref 4421",
      }),
    );

    const json = (await response.json()) as {
      order: Record<string, unknown>;
      paymentProof: Record<string, unknown>;
      paymentVerificationStatus: string;
    };
    expect(json.paymentVerificationStatus).toBe("pendiente_verificacion");
    expect(json.paymentProof).toEqual({
      url: "https://cdn.example.com/tenants/la-parada/payment-proofs/pedido-123/uuid-nequi.png",
      uploadedAt: "2026-11-24T01:05:00.000Z",
      channel: "nequi",
      reference: "Ref 4421",
    });
    expect(json.paymentProof).not.toHaveProperty("key");
    expect(json.paymentProof).not.toHaveProperty("uploadedByUid");
    expect(json.order).not.toHaveProperty("audit");
    expect(json.order).not.toHaveProperty("clienteUid");
  });

  it("limpia el objeto en R2 si Firestore falla y registra sin exponer detalles internos", async () => {
    attachOrderPaymentProof.mockRejectedValueOnce(new Error("Firestore write error interno"));
    deleteOrderPaymentProof.mockRejectedValueOnce(new Error("secreto R2"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const response = await POST(
        requestWithProof({ file: { body: PNG_BYTES, name: "nequi.png", type: "image/png" } }),
        { params: Promise.resolve({ id: "pedido-123" }) },
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: "No fue posible completar la solicitud",
      });
      expect(deleteOrderPaymentProof).toHaveBeenCalledWith(
        "tenants/la-parada/payment-proofs/pedido-123/uuid-nequi.png",
      );
      expect(consoleError).toHaveBeenCalledWith("[order-payment-proof-cleanup]", {
        orderId: "pedido-123",
        key: "tenants/la-parada/payment-proofs/pedido-123/uuid-nequi.png",
      });
      expect(consoleError.mock.calls.flat().join(" ")).not.toContain("secreto R2");
    } finally {
      consoleError.mockRestore();
    }
  });

  it("elimina el comprobante previo en R2 al reemplazar la captura", async () => {
    attachOrderPaymentProof.mockResolvedValueOnce({
      order: sampleOrder,
      previousProofKey: "tenants/la-parada/payment-proofs/pedido-123/anterior.png",
    });

    const response = await POST(
      requestWithProof({ file: { body: PNG_BYTES, name: "nuevo.png", type: "image/png" } }),
      { params: Promise.resolve({ id: "pedido-123" }) },
    );

    expect(response.status).toBe(201);
    expect(deleteOrderPaymentProof).toHaveBeenCalledWith(
      "tenants/la-parada/payment-proofs/pedido-123/anterior.png",
    );
  });

  it("PATCH requiere pedidos.update, valida estado Zod y actualiza la verificación del pago", async () => {
    requirePermission.mockRejectedValueOnce(new AuthorizationError(403, "Prohibido"));
    const forbidden = await PATCH(
      new Request("http://localhost/api/pedidos/pedido-123/comprobante", {
        method: "PATCH",
        body: JSON.stringify({ status: "verificado" }),
      }),
      { params: Promise.resolve({ id: "pedido-123" }) },
    );
    expect(forbidden.status).toBe(403);

    const invalid = await PATCH(
      new Request("http://localhost/api/pedidos/pedido-123/comprobante", {
        method: "PATCH",
        body: JSON.stringify({ status: "inventado" }),
      }),
      { params: Promise.resolve({ id: "pedido-123" }) },
    );
    expect(invalid.status).toBe(422);

    const malformed = await PATCH(
      new Request("http://localhost/api/pedidos/pedido-123/comprobante", {
        method: "PATCH",
        body: "{",
      }),
      { params: Promise.resolve({ id: "pedido-123" }) },
    );
    expect(malformed.status).toBe(422);

    const verified = await PATCH(
      new Request("http://localhost/api/pedidos/pedido-123/comprobante", {
        method: "PATCH",
        body: JSON.stringify({ status: "verificado" }),
      }),
      { params: Promise.resolve({ id: "pedido-123" }) },
    );
    expect(verified.status).toBe(200);
    expect(updateOrderPaymentVerification).toHaveBeenCalledWith(baseStaffUser, "pedido-123", {
      status: "verificado",
    });

    updateOrderPaymentVerification.mockResolvedValueOnce({
      ...sampleOrder,
      paymentVerificationStatus: "rechazado",
      paymentVerification: {
        status: "rechazado",
        updatedAt: "2026-11-24T01:12:00.000Z",
        updatedByUid: "staff-1",
        updatedByName: "Cajero Barra",
        reason: "Monto no coincide con el total",
      },
    });
    const rejected = await PATCH(
      new Request("http://localhost/api/pedidos/pedido-123/comprobante", {
        method: "PATCH",
        body: JSON.stringify({
          status: "rechazado",
          reason: "Monto no coincide con el total",
        }),
      }),
      { params: Promise.resolve({ id: "pedido-123" }) },
    );
    expect(rejected.status).toBe(200);
    await expect(rejected.json()).resolves.toMatchObject({
      paymentVerificationStatus: "rechazado",
      paymentVerification: {
        status: "rechazado",
        reason: "Monto no coincide con el total",
      },
    });
  });
});

describe("R2 storage keys y proyección segura toCustomerOrder para comprobantes", () => {
  it("genera claves aisladas por negocioId y sanitiza nombres de archivo", async () => {
    const tenantKey = paymentProofImageKey("ord-123", "Captura Nequi (1).PNG", "la-parada");
    expect(tenantKey).toMatch(
      /^tenants\/la-parada\/payment-proofs\/ord-123\/[0-9a-f-]+-captura-nequi-1\.png$/,
    );

    const defaultKey = paymentProofImageKey("ord-123", "comprobante.webp", "coctels-ops");
    expect(defaultKey).toMatch(
      /^orders\/payment-proofs\/ord-123\/[0-9a-f-]+-comprobante\.webp$/,
    );

    expect(() => paymentProofImageKey("../hack", "ok.jpg")).toThrow();
    expect(() => paymentProofImageKey("ord-123", "../secret.jpg")).toThrow();

    const put = vi.fn().mockResolvedValue(undefined);
    const store = {
      put,
      remove: vi.fn(),
      publicUrl: (key: string) => `https://cdn.example.com/${key}`,
    };

    const uploaded = await uploadPaymentProofImageBytes(
      { bytes: PNG_BYTES, filename: "Captura.png", contentType: "image/png" },
      "ord-123",
      store,
      { negocioId: "la-parada" },
    );
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        key: uploaded.key,
        contentType: "image/png",
      }),
    );
    expect(uploaded.url).toBe(`https://cdn.example.com/${uploaded.key}`);
  });

  it("omite claves internas R2 y actorUid al proyectar el pedido al cliente", () => {
    const projected = toCustomerOrder({
      ...sampleOrder,
      paymentProof: {
        url: "https://cdn.example.com/proof.png",
        key: "orders/payment-proofs/pedido-123/secret-key.png",
        contentType: "image/png",
        uploadedAt: "2026-11-24T01:05:00.000Z",
        uploadedByUid: "customer-1",
        channel: "nequi",
        reference: "Ref 99",
      },
      paymentVerification: {
        status: "rechazado",
        updatedAt: "2026-11-24T01:08:00.000Z",
        updatedByUid: "staff-secret-uid",
        updatedByName: "Staff Privado",
        reason: "Comprobante ilegible",
      },
      paymentVerificationStatus: "rechazado",
    });

    expect(projected.paymentVerificationStatus).toBe("rechazado");
    expect(projected.paymentProof).toEqual({
      url: "https://cdn.example.com/proof.png",
      uploadedAt: "2026-11-24T01:05:00.000Z",
      channel: "nequi",
      reference: "Ref 99",
    });
    expect(projected.paymentVerification).toEqual({
      status: "rechazado",
      updatedAt: "2026-11-24T01:08:00.000Z",
      reason: "Comprobante ilegible",
    });
    expect(projected.paymentProof).not.toHaveProperty("key");
    expect(projected.paymentProof).not.toHaveProperty("uploadedByUid");
    expect(projected.paymentVerification).not.toHaveProperty("updatedByUid");
    expect(projected.paymentVerification).not.toHaveProperty("updatedByName");
  });
});
