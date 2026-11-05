import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const { get, where, limit, collection, doc, set, update, runTransaction, transactionGet, transactionUpdate, transactionSet } = vi.hoisted(() => ({
  get: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  runTransaction: vi.fn(),
  transactionGet: vi.fn(),
  transactionUpdate: vi.fn(),
  transactionSet: vi.fn(),
}));

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => ({
    collection,
    runTransaction,
  }),
}));

import { catalogImageKey } from "@/lib/catalog/storage";
import {
  assertProductTenantAccess,
  patchProduct,
} from "@/lib/firestore/products";
import {
  getNegocioBySlug,
  getNegocioById,
} from "@/lib/firestore/tenant";
import {
  hasNegocioAccess,
  requireNegocioAccess,
  isGlobalAdmin,
} from "@/lib/auth/permissions";
import { negocioInputSchema, negocioSlugSchema } from "@/lib/validation/tenant";
import type { CatalogCaller } from "@/types/catalog";
import type { VerifiedUser } from "@/types/auth";
import type { NegocioInput } from "@/types/tenant";

const sampleNegocioInput: NegocioInput = {
  slug: "la-parada-poblado",
  name: "La Parada Poblado",
  description: "Sede exclusiva de granizados artesanales en El Poblado.",
  active: true,
  plan: "pro",
  branding: {
    logoUrl: "/catalog-placeholder.svg",
    primaryColor: "#E5196E",
    accentColor: "#00BCD4",
    slogan: "Los mejores granizados de Medellín",
  },
  configuracion: {
    whatsappNumber: "573001234567",
    businessHours: [
      { day: "Lunes a Domingo", open: "12:00", close: "23:00" },
    ],
    deliveryZones: ["El Poblado", "Ciudad del Río"],
    estimatedDeliveryMinutes: 35,
    messages: {
      orderReceived: "Pedido recibido en La Parada Poblado",
      orderStatus: "Tu pedido está preparándose",
      unavailable: "En este momento nos encontramos cerrados",
    },
  },
  ownerUid: "owner-1",
  staffUids: ["staff-1", "staff-2"],
};

function createCaller(overrides: Partial<VerifiedUser["profile"]> = {}, isAdmin = false): CatalogCaller {
  return {
    uid: overrides.uid || "user-1",
    token: { uid: overrides.uid || "user-1", admin: isAdmin },
    profile: {
      uid: overrides.uid || "user-1",
      email: "staff@example.com",
      displayName: "Staff",
      photoURL: null,
      telefono: null,
      addresses: [],
      active: true,
      accountType: isAdmin ? "admin" : "staff",
      roleIds: ["staff"],
      permissions: ["productos.write", "productos.read"],
      createdAt: "2026-08-04T00:00:00.000Z",
      lastLoginAt: "2026-08-04T00:00:00.000Z",
      ...overrides,
    },
    permissions: ["productos.write", "productos.read"],
  };
}

describe("Aislamiento Multi-Tenant Coctels OPS (TASK-06)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    collection.mockReturnValue({ where, doc, get });
    where.mockReturnValue({ where, limit, get });
    limit.mockReturnValue({ get });
    doc.mockReturnValue({ get, set, update });
    runTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      return callback({
        get: transactionGet,
        update: transactionUpdate,
        set: transactionSet,
      });
    });
  });

  describe("1. Generación de claves R2 con namespace por tenant", () => {
    it("genera clave canónica de catálogo cuando no hay negocioId o es coctels-ops", () => {
      const keyDefault = catalogImageKey("granizado-fresa", "fresa.png");
      expect(keyDefault).toMatch(/^catalog\/products\/granizado-fresa\/[0-9a-f-]{36}-fresa\.png$/);

      const keyCoctelsOps = catalogImageKey("granizado-fresa", "fresa.png", "coctels-ops");
      expect(keyCoctelsOps).toMatch(/^catalog\/products\/granizado-fresa\/[0-9a-f-]{36}-fresa\.png$/);
    });

    it("genera clave aislada en tenants/{negocioId}/products/... para locales multi-tenant", () => {
      const keyTenant = catalogImageKey("granizado-mango", "mango.png", "la-parada-poblado");
      expect(keyTenant).toMatch(/^tenants\/la-parada-poblado\/products\/granizado-mango\/[0-9a-f-]{36}-mango\.png$/);
    });
  });

  describe("2. Aislamiento estricto de productos por negocio", () => {
    it("permite a un superadmin global acceder a productos de cualquier negocio", () => {
      const adminCaller = createCaller({ uid: "admin-master", accountType: "admin" }, true);
      expect(isGlobalAdmin(adminCaller)).toBe(true);
      expect(hasNegocioAccess(adminCaller, "la-parada-poblado")).toBe(true);
      expect(() => assertProductTenantAccess(adminCaller, "la-parada-poblado")).not.toThrow();
    });

    it("permite a un staff acceder a los productos de su propio local", () => {
      const staffLocalA = createCaller({ uid: "staff-local-a", negocioId: "la-parada-poblado" });
      expect(hasNegocioAccess(staffLocalA, "la-parada-poblado")).toBe(true);
      expect(() => assertProductTenantAccess(staffLocalA, "la-parada-poblado")).not.toThrow();
      expect(() => requireNegocioAccess(staffLocalA, "la-parada-poblado")).not.toThrow();
    });

    it("deniega y bloquea con 403 a un staff que intenta acceder a productos de otro local", () => {
      const staffLocalA = createCaller({ uid: "staff-local-a", negocioId: "la-parada-poblado" });
      expect(hasNegocioAccess(staffLocalA, "coctels-laureles")).toBe(false);
      expect(() => assertProductTenantAccess(staffLocalA, "coctels-laureles")).toThrow("No tienes permiso");
      expect(() => requireNegocioAccess(staffLocalA, "coctels-laureles")).toThrow("No tienes permiso");
    });

    it("rechaza el patchProduct de un producto ajeno a su negocio", async () => {
      const staffLocalA = createCaller({ uid: "staff-local-a", negocioId: "la-parada-poblado" });

      // Simular que el producto en Firestore pertenece a "coctels-laureles"
      transactionGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          name: "Coctel Laureles Especial",
          description: "Exclusivo de Laureles",
          price: 18000,
          image: "/catalog-placeholder.svg",
          category: "cocktail",
          availableSizes: [{ name: "16 oz", price: 18000 }],
          availableFlavors: ["Maracuyá"],
          availableAddOns: [],
          stock: 5,
          active: true,
          featured: false,
          negocioId: "coctels-laureles",
        }),
      });

      await expect(
        patchProduct("prod-laureles-1", { stock: 0 }, staffLocalA),
      ).rejects.toThrow("No tienes permiso para acceder a productos de otro negocio");
    });
  });

  describe("3. Resolución de tiendas por slug", () => {
    it("obtiene un negocio por su id", async () => {
      doc.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({
          exists: true,
          id: "negocio-123",
          data: () => ({ ...sampleNegocioInput }),
        }),
      });

      const negocio = await getNegocioById("negocio-123");
      expect(negocio).not.toBeNull();
      expect(negocio?.id).toBe("negocio-123");
      expect(negocio?.slug).toBe("la-parada-poblado");
    });

    it("resuelve un negocio activo por su slug", async () => {
      limit.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({
          empty: false,
          docs: [
            {
              id: "negocio-123",
              data: () => ({ ...sampleNegocioInput, active: true }),
            },
          ],
        }),
      });

      const negocio = await getNegocioBySlug("la-parada-poblado");
      expect(negocio).not.toBeNull();
      expect(negocio?.id).toBe("negocio-123");
      expect(negocio?.name).toBe("La Parada Poblado");
    });

    it("retorna null si el negocio está inactivo para clientes", async () => {
      limit.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({
          empty: false,
          docs: [
            {
              id: "negocio-inactivo",
              data: () => ({ ...sampleNegocioInput, active: false }),
            },
          ],
        }),
      });

      const negocio = await getNegocioBySlug("la-parada-poblado");
      expect(negocio).toBeNull();
    });

    it("retorna null si el slug no existe", async () => {
      limit.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({
          empty: true,
          docs: [],
        }),
      });

      const negocio = await getNegocioBySlug("inexistente");
      expect(negocio).toBeNull();
    });
  });

  describe("4. Validación de esquemas Zod multi-tenant", () => {
    it("valida slugs válidos en minúsculas y con guiones", () => {
      expect(negocioSlugSchema.parse("la-parada")).toBe("la-parada");
      expect(negocioSlugSchema.parse("coctels-ops-2026")).toBe("coctels-ops-2026");
    });

    it("rechaza slugs con mayúsculas, espacios o caracteres prohibidos", () => {
      expect(() => negocioSlugSchema.parse("La-Parada")).toThrow();
      expect(() => negocioSlugSchema.parse("la parada")).toThrow();
      expect(() => negocioSlugSchema.parse("la--parada")).toThrow();
      expect(() => negocioSlugSchema.parse("a")).toThrow();
    });

    it("valida la estructura completa de un NegocioInput", () => {
      expect(negocioInputSchema.parse(sampleNegocioInput)).toEqual(sampleNegocioInput);
    });
  });

  describe("5. Reglas de seguridad de Firestore para Multi-Tenant", () => {
    it("mantiene reglas de sólo lectura pública o admin y prohíbe escritura desde el cliente", () => {
      const rules = readFileSync("firestore.rules", "utf8");

      expect(rules).toContain("match /negocios/{negocioId} {");
      expect(rules).toContain("allow read: if resource.data.active == true || isAdmin();");
      expect(rules).toContain("match /usuarios_negocio/{membershipId} {");
      expect(rules).toContain("allow read: if signedIn() && (resource.data.uid == request.auth.uid || isAdmin());");

      // Cero escrituras directas en cliente para las colecciones multi-tenant
      const negociosSection = rules.split("match /negocios/{negocioId} {")[1].split("}")[0];
      expect(negociosSection).toContain("allow write: if false;");

      const usuariosNegocioSection = rules.split("match /usuarios_negocio/{membershipId} {")[1].split("}")[0];
      expect(usuariosNegocioSection).toContain("allow write: if false;");
    });
  });
});
