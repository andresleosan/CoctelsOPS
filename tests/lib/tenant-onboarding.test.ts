import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  put,
  remove,
  publicUrl,
  collection,
  runTransaction,
  getUserByEmail,
  getUser,
  createUser,
} = vi.hoisted(() => ({
  put: vi.fn(),
  remove: vi.fn(),
  publicUrl: vi.fn(),
  collection: vi.fn(),
  runTransaction: vi.fn(),
  getUserByEmail: vi.fn(),
  getUser: vi.fn(),
  createUser: vi.fn(),
}));

const store = { put, remove, publicUrl };

// In-memory Firestore state for repository tests
type MockDocRecord = Record<string, unknown>;
let mockCollections: Record<string, Map<string, MockDocRecord>> = {};

function ensureCollection(name: string): Map<string, MockDocRecord> {
  if (!mockCollections[name]) {
    mockCollections[name] = new Map<string, MockDocRecord>();
  }
  return mockCollections[name];
}

function makeDocRef(collectionName: string, id: string) {
  return {
    id,
    path: `${collectionName}/${id}`,
    get: async () => {
      const data = ensureCollection(collectionName).get(id);
      return {
        exists: Boolean(data),
        id,
        data: () => (data ? { ...data } : undefined),
      };
    },
    set: async (data: MockDocRecord, options?: { merge?: boolean }) => {
      const col = ensureCollection(collectionName);
      if (options?.merge && col.has(id)) {
        col.set(id, { ...col.get(id), ...data });
      } else {
        col.set(id, { ...data });
      }
    },
    update: async (data: MockDocRecord) => {
      const col = ensureCollection(collectionName);
      if (!col.has(id)) throw new Error(`Missing ${collectionName}/${id}`);
      col.set(id, { ...col.get(id), ...data });
    },
  };
}

vi.mock("@/lib/catalog/r2-client", () => ({
  getR2CatalogImageStore: () => store,
}));

vi.mock("@/lib/firebase-admin", () => ({
  getAdminAuth: () => ({
    getUserByEmail,
    getUser,
    createUser,
  }),
  getAdminDb: () => ({
    collection,
    runTransaction,
  }),
}));

import { DEFAULT_CATALOG_PLACEHOLDER } from "@/lib/catalog/image-validation";
import {
  STARTER_CATALOG_TEMPLATE,
  buildTenantClonedProductId,
  sanitizeClonedProductInput,
} from "@/lib/catalog/starter-template";
import { tenantBrandingImageKey, uploadTenantLogoBytes } from "@/lib/catalog/storage";
import {
  TenantValidationError,
  assignStaffToNegocioByIdentity,
  cloneCatalogForNegocio,
  listNegocioStaff,
} from "@/lib/firestore/tenant";
import { productInputSchema } from "@/lib/validation/catalog";
import type { VerifiedUser } from "@/types/auth";

function createCaller(
  overrides: Partial<VerifiedUser["profile"]> = {},
  isAdmin = false,
): VerifiedUser {
  const uid = overrides.uid || (isAdmin ? "global-admin-1" : "staff-1");
  return {
    uid,
    token: { uid, admin: isAdmin, email_verified: true },
    profile: {
      uid,
      email: isAdmin ? "admin@coctelsops.com" : "staff@local-a.com",
      displayName: "Operador",
      photoURL: null,
      telefono: null,
      addresses: [],
      active: true,
      accountType: isAdmin ? "admin" : "staff",
      roleIds: isAdmin ? ["admin"] : ["local-manager"],
      permissions: ["configuracion.read", "configuracion.write"],
      createdAt: "2026-01-01T00:00:00.000Z",
      lastLoginAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    },
    permissions: ["configuracion.read", "configuracion.write"],
  };
}

const sampleNegocioDoc: MockDocRecord = {
  slug: "sede-poblado",
  name: "Coctels OPS Poblado",
  description: "Sede en El Poblado",
  active: true,
  plan: "pro",
  branding: {
    logoUrl: "/catalog-placeholder.svg",
    slogan: "Granizados artesanales",
    primaryColor: "#E5196E",
    accentColor: "#00BCD4",
  },
  configuracion: {
    whatsappNumber: "573001234567",
    businessHours: [{ day: "Lunes a Domingo", open: "12:00", close: "23:00" }],
    deliveryZones: ["El Poblado"],
    estimatedDeliveryMinutes: 30,
    messages: {
      orderReceived: "Recibido",
      orderStatus: "En proceso",
      unavailable: "Cerrado",
    },
  },
  ownerUid: "owner-poblado",
  staffUids: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("Onboarding SaaS multi-tenant (TASK-40)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCollections = {};
    ensureCollection("negocios").set("neg-poblado", { ...sampleNegocioDoc });

    put.mockResolvedValue(undefined);
    remove.mockResolvedValue(undefined);
    publicUrl.mockImplementation((key: string) => `https://cdn.coctelsops.com/${key}`);

    collection.mockImplementation((name: string) => {
      let autoIdCounter = 0;
      const col = ensureCollection(name);
      return {
        doc: (id?: string) => {
          const docId = id ?? `${name}-${++autoIdCounter}`;
          return makeDocRef(name, docId);
        },
        where: (field: string, _op: string, value: unknown) => ({
          limit: (n: number) => ({
            get: async () => {
              const matched = [...col.entries()]
                .filter(([, data]) => data[field] === value)
                .slice(0, n)
                .map(([docId, data]) => ({ id: docId, data: () => ({ ...data }) }));
              return { empty: matched.length === 0, size: matched.length, docs: matched };
            },
          }),
          get: async () => {
            const matched = [...col.entries()]
              .filter(([, data]) => data[field] === value)
              .map(([docId, data]) => ({ id: docId, data: () => ({ ...data }) }));
            return { empty: matched.length === 0, size: matched.length, docs: matched };
          },
        }),
        get: async () => {
          const docs = [...col.entries()].map(([docId, data]) => ({
            id: docId,
            data: () => ({ ...data }),
          }));
          return { empty: docs.length === 0, size: docs.length, docs };
        },
      };
    });

    runTransaction.mockImplementation(
      async (callback: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const tx = {
          get: async (ref: { get: () => Promise<unknown> }) => ref.get(),
          set: (ref: { set: (d: MockDocRecord, opts?: { merge?: boolean }) => Promise<void> }, data: MockDocRecord, opts?: { merge?: boolean }) => {
            void ref.set(data, opts);
          },
          create: (ref: { set: (d: MockDocRecord) => Promise<void> }, data: MockDocRecord) => {
            void ref.set(data);
          },
          update: (ref: { update: (d: MockDocRecord) => Promise<void> }, data: MockDocRecord) => {
            void ref.update(data);
          },
        };
        return callback(tx);
      },
    );
  });

  describe("1. Plantilla de carta base y generación de IDs", () => {
    it("contiene 6 productos válidos con precios exactos en COP y placeholder oficial", () => {
      expect(STARTER_CATALOG_TEMPLATE).toHaveLength(6);
      for (const item of STARTER_CATALOG_TEMPLATE) {
        const parsed = productInputSchema.parse({
          ...item.product,
          negocioId: "neg-poblado",
        });
        expect(parsed.image).toBe(DEFAULT_CATALOG_PLACEHOLDER);
        expect(parsed.price).toBeGreaterThan(0);
      }
    });

    it("genera IDs determinísticos seguros para rutas de R2", () => {
      const id = buildTenantClonedProductId("Sede_Poblado!", "granizado-fresa-salvaje");
      expect(id).toBe("sede-poblado-granizado-fresa-salvaje");
      expect(id).toMatch(/^[a-z0-9-]+$/);
    });

    it("reemplaza imágenes de hosts no permitidos al sanitizar productos clonados", () => {
      const sanitized = sanitizeClonedProductInput(
        {
          ...STARTER_CATALOG_TEMPLATE[0]!.product,
          image: "https://untrusted.example.com/foto.jpg",
        },
        "neg-poblado",
      );
      expect(sanitized.image).toBe(DEFAULT_CATALOG_PLACEHOLDER);
      expect(sanitized.negocioId).toBe("neg-poblado");
    });
  });

  describe("2. Almacenamiento R2 para logos de branding por tenant", () => {
    it("genera claves aisladas en tenants/{negocioId}/branding/logo/...", async () => {
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const key = tenantBrandingImageKey("neg-poblado", "Mi Logo!.png");
      expect(key).toMatch(/^tenants\/neg-poblado\/branding\/logo\/[0-9a-f-]{36}-mi-logo\.png$/);

      const uploaded = await uploadTenantLogoBytes(
        { bytes: pngBytes, filename: "logo.png", contentType: "image/png" },
        "neg-poblado",
      );
      expect(uploaded.key).toMatch(/^tenants\/neg-poblado\/branding\/logo\//);
      expect(uploaded.url).toBe(`https://cdn.coctelsops.com/${uploaded.key}`);
      expect(put).toHaveBeenCalledTimes(1);
    });

    it("rechaza magic bytes falsos o traversal en logos", async () => {
      await expect(
        uploadTenantLogoBytes(
          { bytes: new Uint8Array([1, 2, 3]), filename: "logo.png", contentType: "image/png" },
          "neg-poblado",
        ),
      ).rejects.toMatchObject({ status: 422 });
      expect(() => tenantBrandingImageKey("../escape", "logo.png")).toThrow();
      expect(put).not.toHaveBeenCalled();
    });
  });

  describe("3. Clonación idempotente de carta inicial por local", () => {
    it("clona los 6 productos con negocioId destino y omite existentes en re-ejecución", async () => {
      const caller = createCaller({ negocioId: "neg-poblado" }, false);

      const firstRun = await cloneCatalogForNegocio("neg-poblado", caller, { source: "starter" });
      expect(firstRun.createdCount).toBe(6);
      expect(firstRun.skippedCount).toBe(0);
      expect(firstRun.productIds).toHaveLength(6);

      const productsCol = ensureCollection("productos");
      expect(productsCol.size).toBe(6);
      for (const product of productsCol.values()) {
        expect(product.negocioId).toBe("neg-poblado");
      }
      expect(ensureCollection("categorias").size).toBe(3);

      const secondRun = await cloneCatalogForNegocio("neg-poblado", caller, { source: "starter" });
      expect(secondRun.createdCount).toBe(0);
      expect(secondRun.skippedCount).toBe(6);
    });

    it("bloquea con 403 a un staff de otro local o si intenta clonar desde el local principal", async () => {
      const otherStaff = createCaller({ negocioId: "neg-laureles" }, false);
      await expect(
        cloneCatalogForNegocio("neg-poblado", otherStaff, { source: "starter" }),
      ).rejects.toMatchObject({ status: 403 });

      const ownStaff = createCaller({ negocioId: "neg-poblado" }, false);
      await expect(
        cloneCatalogForNegocio("neg-poblado", ownStaff, { source: "default-tenant" }),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  describe("4. Asignación y desvinculación segura de staff por negocioId", () => {
    it("vincula un usuario existente por correo sin otorgar privilegios de admin global", async () => {
      const adminCaller = createCaller({}, true);
      getUserByEmail.mockResolvedValueOnce({
        uid: "user-bartender-1",
        email: "bartender@sede.com",
        displayName: "Mateo Barra",
        photoURL: null,
        customClaims: {},
      });
      ensureCollection("users").set("user-bartender-1", {
        uid: "user-bartender-1",
        email: "bartender@sede.com",
        displayName: "Mateo Barra",
        active: true,
        accountType: "customer",
        roleIds: ["customer"],
      });

      const result = await assignStaffToNegocioByIdentity(
        "neg-poblado",
        { email: "bartender@sede.com", role: "staff", rolePresetId: "barra-pedidos", active: true },
        adminCaller,
      );

      expect(result.createdAuthUser).toBe(false);
      expect(result.member).toMatchObject({
        uid: "user-bartender-1",
        negocioId: "neg-poblado",
        role: "staff",
        accountType: "staff",
        roleIds: ["barra-pedidos"],
        active: true,
      });

      const savedUser = ensureCollection("users").get("user-bartender-1");
      expect(savedUser?.accountType).toBe("staff");
      expect(savedUser?.negocioId).toBe("neg-poblado");
      expect(ensureCollection("roles").has("barra-pedidos")).toBe(true);
      expect(ensureCollection("negocios").get("neg-poblado")?.staffUids).toContain(
        "user-bartender-1",
      );

      const staffList = await listNegocioStaff("neg-poblado", adminCaller);
      expect(staffList).toHaveLength(1);
      expect(staffList[0]?.email).toBe("bartender@sede.com");
    });

    it("crea la cuenta en Firebase Auth si se envía contraseña temporal y falla con 422 si falta", async () => {
      const adminCaller = createCaller({}, true);
      const notFoundError = Object.assign(new Error("User not found"), {
        code: "auth/user-not-found",
      });

      getUserByEmail.mockRejectedValueOnce(notFoundError);
      await expect(
        assignStaffToNegocioByIdentity(
          "neg-poblado",
          { email: "nuevo@sede.com", role: "staff", active: true },
          adminCaller,
        ),
      ).rejects.toBeInstanceOf(TenantValidationError);

      getUserByEmail.mockRejectedValueOnce(notFoundError);
      createUser.mockResolvedValueOnce({
        uid: "created-uid-1",
        email: "nuevo@sede.com",
        displayName: "Nuevo Manager",
        photoURL: null,
      });

      const created = await assignStaffToNegocioByIdentity(
        "neg-poblado",
        {
          email: "nuevo@sede.com",
          displayName: "Nuevo Manager",
          password: "TempPassword123!",
          role: "owner",
          active: true,
        },
        adminCaller,
      );

      expect(created.createdAuthUser).toBe(true);
      expect(created.member.roleIds).toEqual(["local-manager"]);
      expect(created.member.accountType).toBe("staff");
      const createdRole = ensureCollection("roles").get("local-manager");
      expect(createdRole?.permissions).not.toContain("usuarios.manage");
      expect(createdRole?.permissions).not.toContain("roles.write");
    });

    it("impide que un manager local secuestre staff de otro local o modifique un admin global", async () => {
      const localOwner = createCaller({ uid: "owner-poblado", negocioId: "neg-poblado" }, false);

      getUserByEmail.mockResolvedValueOnce({
        uid: "staff-otro-local",
        email: "otro@laureles.com",
        customClaims: {},
      });
      ensureCollection("users").set("staff-otro-local", {
        uid: "staff-otro-local",
        email: "otro@laureles.com",
        active: true,
        accountType: "staff",
        negocioId: "neg-laureles",
      });

      await expect(
        assignStaffToNegocioByIdentity(
          "neg-poblado",
          { email: "otro@laureles.com", role: "staff", active: true },
          localOwner,
        ),
      ).rejects.toMatchObject({ status: 403 });

      getUserByEmail.mockResolvedValueOnce({
        uid: "super-admin",
        email: "master@coctelsops.com",
        customClaims: { admin: true },
      });
      ensureCollection("users").set("super-admin", {
        uid: "super-admin",
        email: "master@coctelsops.com",
        active: true,
        accountType: "admin",
        roleIds: ["admin"],
      });

      await expect(
        assignStaffToNegocioByIdentity(
          "neg-poblado",
          { email: "master@coctelsops.com", role: "staff", active: true },
          localOwner,
        ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it("desvincula un miembro limpiando negocioId y staffUids", async () => {
      const adminCaller = createCaller({}, true);
      ensureCollection("negocios").set("neg-poblado", {
        ...sampleNegocioDoc,
        staffUids: ["staff-x"],
      });
      ensureCollection("users").set("staff-x", {
        uid: "staff-x",
        email: "staffx@sede.com",
        active: true,
        accountType: "staff",
        negocioId: "neg-poblado",
        negocioRole: "staff",
        roleIds: ["barra-pedidos"],
      });
      getUser.mockResolvedValueOnce({
        uid: "staff-x",
        email: "staffx@sede.com",
        displayName: "Staff X",
        customClaims: {},
      });

      const res = await assignStaffToNegocioByIdentity(
        "neg-poblado",
        { uid: "staff-x", role: "staff", active: false },
        adminCaller,
      );

      expect(res.member.active).toBe(false);
      expect(ensureCollection("users").get("staff-x")?.negocioId).toBeNull();
      expect(ensureCollection("negocios").get("neg-poblado")?.staffUids).toEqual([]);
    });
  });
});
