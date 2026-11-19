import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requirePermissionMock,
  listRecipesMock,
  getCatalogProfitabilityForCallerMock,
  createRecipeMock,
  getRecipeByIdMock,
  updateRecipeMock,
  deleteRecipeMock,
} = vi.hoisted(() => ({
  requirePermissionMock: vi.fn(),
  listRecipesMock: vi.fn(),
  getCatalogProfitabilityForCallerMock: vi.fn(),
  createRecipeMock: vi.fn(),
  getRecipeByIdMock: vi.fn(),
  updateRecipeMock: vi.fn(),
  deleteRecipeMock: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock("@/lib/firestore/recipes", async () => {
  const actual = await vi.importActual<typeof import("@/lib/recipes/escandallo")>(
    "@/lib/recipes/escandallo"
  );
  class RecipeNotFoundError extends Error {
    readonly status = 404;
  }
  class RecipeConflictError extends Error {
    readonly status = 409;
  }
  return {
    ...actual,
    RecipeNotFoundError,
    RecipeConflictError,
    listRecipes: listRecipesMock,
    getCatalogProfitabilityForCaller: getCatalogProfitabilityForCallerMock,
    createRecipe: createRecipeMock,
    getRecipeById: getRecipeByIdMock,
    updateRecipe: updateRecipeMock,
    deleteRecipe: deleteRecipeMock,
  };
});

import { AuthorizationError } from "@/lib/auth/verify-request";
import { RecipeConflictError, RecipeNotFoundError } from "@/lib/firestore/recipes";
import { GET, POST } from "@/app/api/admin/recetas/route";
import {
  DELETE as DELETE_BY_ID,
  GET as GET_BY_ID,
  PATCH as PATCH_BY_ID,
} from "@/app/api/admin/recetas/[id]/route";

const caller = {
  uid: "admin-1",
  permissions: ["inventario.read", "inventario.write"],
  profile: { uid: "admin-1", accountType: "admin" },
};

describe("/api/admin/recetas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue(caller);
  });

  it("lists recipes with optional query filters", async () => {
    listRecipesMock.mockResolvedValue([{ id: "rec-1", productName: "Mojito" }]);

    const req = new Request("http://localhost/api/admin/recetas?negocioId=coctels-ops&productId=p1");
    const res = await GET(req as NextRequest);
    const body = (await res.json()) as { recipes: unknown[] };

    expect(res.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith(req, "inventario.read");
    expect(listRecipesMock).toHaveBeenCalledWith(caller, {
      negocioId: "coctels-ops",
      productId: "p1",
    });
    expect(body.recipes).toHaveLength(1);
  });

  it("returns recipes and profitability when includeProfitability=true", async () => {
    getCatalogProfitabilityForCallerMock.mockResolvedValueOnce({
      recipes: [{ id: "rec-1", productName: "Mojito" }],
      profitability: {
        summary: {
          activeRecipeCount: 1,
          coveredProductCount: 1,
          totalActiveProducts: 1,
          coveragePct: 100,
          averageCostCop: 3600,
          averageMarginPct: 76,
          lowMarginCount: 0,
          criticalMarginCount: 0,
          targetMarginPct: 60,
          warningMarginPct: 50,
          criticalMarginPct: 35,
        },
        items: [],
        lowMarginAlerts: [],
        uncoveredPresentations: [],
      },
    });

    const req = new Request(
      "http://localhost/api/admin/recetas?negocioId=coctels-ops&includeProfitability=true"
    );
    const res = await GET(req as NextRequest);
    const body = (await res.json()) as { recipes: unknown[]; profitability?: { summary: { averageMarginPct: number } } };

    expect(res.status).toBe(200);
    expect(getCatalogProfitabilityForCallerMock).toHaveBeenCalledWith(caller, {
      negocioId: "coctels-ops",
      productId: undefined,
    });
    expect(body.recipes).toHaveLength(1);
    expect(body.profitability?.summary.averageMarginPct).toBe(76);
  });

  it("returns 422 on invalid ingredient unit mismatch when creating a recipe", async () => {
    const req = new Request("http://localhost/api/admin/recetas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId: "p1",
        productName: "Mojito",
        presentation: "16 oz",
        ingredients: [
          {
            supplyId: "s1",
            supplyName: "Vaso",
            supplyUnit: "unidad",
            quantity: 2,
            unit: "oz",
          },
        ],
      }),
    });

    const res = await POST(req as NextRequest);
    expect(res.status).toBe(422);
    expect(createRecipeMock).not.toHaveBeenCalled();
  });

  it("creates a recipe on valid payload and propagates 409 conflict", async () => {
    const payload = {
      productId: "p1",
      productName: "Mojito",
      presentation: "16 oz",
      ingredients: [
        {
          supplyId: "s1",
          supplyName: "Ron Blanco",
          supplyUnit: "ml",
          quantity: 2,
          unit: "oz",
        },
      ],
    };
    createRecipeMock.mockResolvedValueOnce({ id: "rec-1", ...payload });

    const req1 = new Request("http://localhost/api/admin/recetas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const res1 = await POST(req1 as NextRequest);
    expect(res1.status).toBe(201);

    createRecipeMock.mockRejectedValueOnce(new RecipeConflictError("Duplicada"));
    const req2 = new Request("http://localhost/api/admin/recetas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const res2 = await POST(req2 as NextRequest);
    expect(res2.status).toBe(409);
  });
});

describe("/api/admin/recetas/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue(caller);
  });

  it("handles GET, PATCH, DELETE and error mapping", async () => {
    getRecipeByIdMock.mockRejectedValueOnce(new RecipeNotFoundError("No existe"));
    const res404 = await GET_BY_ID(new Request("http://localhost/api/admin/recetas/x") as NextRequest, {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res404.status).toBe(404);

    updateRecipeMock.mockResolvedValueOnce({ id: "rec-1", presentation: "24 oz" });
    const patchReq = new Request("http://localhost/api/admin/recetas/rec-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ presentation: "24 oz" }),
    });
    const patchRes = await PATCH_BY_ID(patchReq as NextRequest, {
      params: Promise.resolve({ id: "rec-1" }),
    });
    expect(patchRes.status).toBe(200);

    deleteRecipeMock.mockRejectedValueOnce(new AuthorizationError(403, "Sin acceso"));
    const delRes = await DELETE_BY_ID(new Request("http://localhost/api/admin/recetas/rec-1") as NextRequest, {
      params: Promise.resolve({ id: "rec-1" }),
    });
    expect(delRes.status).toBe(403);
  });
});
