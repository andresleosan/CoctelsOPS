import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requirePermission,
  listAccessibleNegocios,
  getNegocioOnboardingStats,
  createNegocio,
  cloneCatalogForNegocio,
  getNegocioById,
  updateNegocio,
  listNegocioStaff,
  assignStaffToNegocioByIdentity,
  uploadTenantLogoBytes,
  deleteTenantLogo,
} = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  listAccessibleNegocios: vi.fn(),
  getNegocioOnboardingStats: vi.fn(),
  createNegocio: vi.fn(),
  cloneCatalogForNegocio: vi.fn(),
  getNegocioById: vi.fn(),
  updateNegocio: vi.fn(),
  listNegocioStaff: vi.fn(),
  assignStaffToNegocioByIdentity: vi.fn(),
  uploadTenantLogoBytes: vi.fn(),
  deleteTenantLogo: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    requirePermission,
  };
});

vi.mock("@/lib/auth/verify-request", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/verify-request")>();
  return {
    ...actual,
    toAuthorizationResponse: (error: Error & { status?: number }) =>
      Response.json({ error: error.message }, { status: error.status ?? 500 }),
  };
});

vi.mock("@/lib/firestore/tenant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/firestore/tenant")>();
  return {
    ...actual,
    listAccessibleNegocios,
    getNegocioOnboardingStats,
    createNegocio,
    cloneCatalogForNegocio,
    getNegocioById,
    updateNegocio,
    listNegocioStaff,
    assignStaffToNegocioByIdentity,
  };
});

vi.mock("@/lib/catalog/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalog/storage")>()),
  uploadTenantLogoBytes,
  deleteTenantLogo,
}));

import { GET as listNegociosHandler, POST as createNegocioHandler } from "@/app/api/admin/negocios/route";
import { POST as cloneCatalogHandler } from "@/app/api/admin/negocios/[id]/clone-catalog/route";
import { DELETE as deleteLogoHandler, POST as uploadLogoHandler } from "@/app/api/admin/negocios/[id]/logo/route";
import {
  DELETE as deleteStaffHandler,
  GET as listStaffHandler,
  POST as assignStaffHandler,
} from "@/app/api/admin/negocios/[id]/staff/route";

const globalAdmin = {
  uid: "admin-1",
  token: { uid: "admin-1", admin: true, email_verified: true },
  profile: { uid: "admin-1", active: true, accountType: "admin" as const, roleIds: ["admin"] },
  permissions: ["configuracion.read", "configuracion.write"],
};

const staffLocalA = {
  uid: "staff-a",
  token: { uid: "staff-a", admin: false, email_verified: true },
  profile: {
    uid: "staff-a",
    active: true,
    accountType: "staff" as const,
    roleIds: ["local-manager"],
    negocioId: "local-a",
  },
  permissions: ["configuracion.read", "configuracion.write"],
};

const sampleNegocio = {
  id: "local-a",
  slug: "local-a",
  name: "Local A",
  description: "Sede A",
  active: true,
  plan: "pro",
  branding: { logoUrl: "/catalog-placeholder.svg", slogan: "Frescura neón" },
  configuracion: {
    whatsappNumber: "573001234567",
    businessHours: [{ day: "Lunes a Domingo", open: "12:00", close: "23:00" }],
    deliveryZones: ["Centro"],
    estimatedDeliveryMinutes: 30,
    messages: { orderReceived: "OK", orderStatus: "OK", unavailable: "Cerrado" },
  },
  ownerUid: "owner-a",
  staffUids: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function requestWithLogoFile(file: { body: string | Uint8Array; name: string; type: string }): Request {
  const bytes = typeof file.body === "string" ? new TextEncoder().encode(file.body) : file.body;
  const uploadedFile = {
    name: file.name,
    type: file.type,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer,
  } as unknown as File;
  return {
    formData: async () => ({ get: (key: string) => (key === "logo" ? uploadedFile : null) }),
  } as unknown as Request;
}

describe("API Onboarding SaaS /api/admin/negocios/*", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermission.mockResolvedValue(globalAdmin);
    listAccessibleNegocios.mockResolvedValue([sampleNegocio]);
    getNegocioOnboardingStats.mockResolvedValue({ "local-a": { productCount: 6, staffCount: 2 } });
    getNegocioById.mockResolvedValue(sampleNegocio);
    updateNegocio.mockImplementation(async (_id: string, patch: { branding?: { logoUrl?: string } }) => ({
      ...sampleNegocio,
      branding: { ...sampleNegocio.branding, ...(patch.branding ?? {}) },
    }));
    uploadTenantLogoBytes.mockResolvedValue({
      key: "tenants/local-a/branding/logo/uuid-logo.png",
      url: "https://cdn.coctelsops.com/tenants/local-a/branding/logo/uuid-logo.png",
    });
    cloneCatalogForNegocio.mockResolvedValue({
      negocioId: "local-a",
      source: "starter",
      createdCount: 6,
      skippedCount: 0,
      productIds: ["local-a-fresa"],
    });
    listNegocioStaff.mockResolvedValue([]);
    assignStaffToNegocioByIdentity.mockResolvedValue({
      member: {
        uid: "u-1",
        email: "barra@locala.com",
        displayName: "Barra",
        negocioId: "local-a",
        role: "staff",
        active: true,
        assignedAt: "2026-01-01T00:00:00.000Z",
        accountType: "staff",
        roleIds: ["barra-pedidos"],
      },
      createdAuthUser: false,
    });
  });

  it("GET /api/admin/negocios expone locales accesibles, canCreate y stats", async () => {
    const adminRes = await listNegociosHandler(new Request("http://localhost/api/admin/negocios"));
    expect(adminRes.status).toBe(200);
    await expect(adminRes.json()).resolves.toEqual({
      negocios: [sampleNegocio],
      canCreate: true,
      stats: { "local-a": { productCount: 6, staffCount: 2 } },
    });

    requirePermission.mockResolvedValueOnce(staffLocalA);
    const staffRes = await listNegociosHandler(new Request("http://localhost/api/admin/negocios"));
    expect(staffRes.status).toBe(200);
    await expect(staffRes.json()).resolves.toMatchObject({ canCreate: false });
  });

  it("POST /api/admin/negocios crea el local y clona la carta base cuando cloneStarterCatalog es true", async () => {
    createNegocio.mockResolvedValueOnce("local-nuevo");

    const res = await createNegocioHandler(
      new Request("http://localhost/api/admin/negocios", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: "local-nuevo",
          name: "Local Nuevo",
          description: "Sede Laureles",
          active: true,
          plan: "pro",
          branding: { logoUrl: "/catalog-placeholder.svg", slogan: "Frescura" },
          configuracion: sampleNegocio.configuracion,
          ownerUid: "owner-1",
          staffUids: [],
          cloneStarterCatalog: true,
        }),
      }),
    );

    expect(res.status).toBe(201);
    expect(createNegocio).toHaveBeenCalledTimes(1);
    expect(cloneCatalogForNegocio).toHaveBeenCalledWith("local-nuevo", globalAdmin, {
      source: "starter",
    });
  });

  it("POST /api/admin/negocios/[id]/clone-catalog clona carta y tolera cuerpo vacío", async () => {
    const res = await cloneCatalogHandler(
      new Request("http://localhost/api/admin/negocios/local-a/clone-catalog", { method: "POST" }),
      { params: Promise.resolve({ id: "local-a" }) },
    );

    expect(res.status).toBe(200);
    expect(cloneCatalogForNegocio).toHaveBeenCalledWith("local-a", globalAdmin, {
      source: "starter",
      overwrite: false,
    });
  });

  it("POST y DELETE /api/admin/negocios/[id]/logo validan magic bytes, tamaño, tenant y limpian en error", async () => {
    requirePermission.mockResolvedValueOnce(staffLocalA);
    const crossTenant = await uploadLogoHandler(
      requestWithLogoFile({
        body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        name: "logo.png",
        type: "image/png",
      }),
      { params: Promise.resolve({ id: "local-b" }) },
    );
    expect(crossTenant.status).toBe(403);

    const badBytes = await uploadLogoHandler(
      requestWithLogoFile({ body: new Uint8Array([1, 2, 3]), name: "logo.png", type: "image/png" }),
      { params: Promise.resolve({ id: "local-a" }) },
    );
    expect(badBytes.status).toBe(422);

    const tooLarge = await uploadLogoHandler(
      requestWithLogoFile({
        body: new Uint8Array(5 * 1024 * 1024 + 1),
        name: "logo.png",
        type: "image/png",
      }),
      { params: Promise.resolve({ id: "local-a" }) },
    );
    expect(tooLarge.status).toBe(413);

    const okUpload = await uploadLogoHandler(
      requestWithLogoFile({
        body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        name: "logo.png",
        type: "image/png",
      }),
      { params: Promise.resolve({ id: "local-a" }) },
    );
    expect(okUpload.status).toBe(200);
    await expect(okUpload.json()).resolves.toMatchObject({
      logoUrl: "https://cdn.coctelsops.com/tenants/local-a/branding/logo/uuid-logo.png",
    });

    updateNegocio.mockRejectedValueOnce(new Error("DB error"));
    const failedDb = await uploadLogoHandler(
      requestWithLogoFile({
        body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        name: "logo.png",
        type: "image/png",
      }),
      { params: Promise.resolve({ id: "local-a" }) },
    );
    expect(failedDb.status).toBe(500);
    expect(deleteTenantLogo).toHaveBeenCalledWith("tenants/local-a/branding/logo/uuid-logo.png");

    const resetRes = await deleteLogoHandler(
      new Request("http://localhost/api/admin/negocios/local-a/logo", { method: "DELETE" }),
      { params: Promise.resolve({ id: "local-a" }) },
    );
    expect(resetRes.status).toBe(200);
    expect(updateNegocio).toHaveBeenLastCalledWith(
      "local-a",
      { branding: { logoUrl: "/catalog-placeholder.svg" } },
      globalAdmin,
    );
  });

  it("GET, POST y DELETE /api/admin/negocios/[id]/staff gestionan miembros por local", async () => {
    requirePermission.mockResolvedValueOnce(staffLocalA);
    const forbiddenList = await listStaffHandler(
      new Request("http://localhost/api/admin/negocios/local-b/staff"),
      { params: Promise.resolve({ id: "local-b" }) },
    );
    expect(forbiddenList.status).toBe(403);

    const invalidAssign = await assignStaffHandler(
      new Request("http://localhost/api/admin/negocios/local-a/staff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "staff" }),
      }),
      { params: Promise.resolve({ id: "local-a" }) },
    );
    expect(invalidAssign.status).toBe(422);

    const okAssign = await assignStaffHandler(
      new Request("http://localhost/api/admin/negocios/local-a/staff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "barra@locala.com", role: "staff" }),
      }),
      { params: Promise.resolve({ id: "local-a" }) },
    );
    expect(okAssign.status).toBe(200);
    expect(assignStaffToNegocioByIdentity).toHaveBeenCalledWith(
      "local-a",
      expect.objectContaining({ email: "barra@locala.com", role: "staff", active: true }),
      globalAdmin,
    );

    const okRemove = await deleteStaffHandler(
      new Request("http://localhost/api/admin/negocios/local-a/staff?uid=u-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "local-a" }) },
    );
    expect(okRemove.status).toBe(200);
    expect(assignStaffToNegocioByIdentity).toHaveBeenLastCalledWith(
      "local-a",
      { uid: "u-1", role: "staff", active: false },
      globalAdmin,
    );
  });
});
