import { beforeEach, describe, expect, it, vi } from "vitest";

const { requirePermission, uploadProductImageBytes, deleteProductImage, updateProductImage, getProductById } = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  uploadProductImageBytes: vi.fn(),
  deleteProductImage: vi.fn(),
  updateProductImage: vi.fn(),
  getProductById: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({ requirePermission }));
vi.mock("@/lib/auth/verify-request", () => ({
  toAuthorizationResponse: (error: Error & { status?: number }) => Response.json({ error: error.message }, { status: error.status ?? 500 }),
}));
vi.mock("@/lib/catalog/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalog/storage")>()),
  uploadProductImageBytes,
  deleteProductImage,
}));
vi.mock("@/lib/firestore/products", () => ({ updateProductImage, getProductById }));

import { DELETE, POST } from "@/app/api/admin/productos/[id]/image/route";

const actor = { uid: "admin-1", permissions: ["productos.write"] };
const product = { id: "fresa-salvaje", name: "Fresa Salvaje", image: "https://old.example/image.jpg" };

function requestWithFile(file: { body: string | Uint8Array; name: string; type: string }): Request {
  const bytes = typeof file.body === "string" ? new TextEncoder().encode(file.body) : file.body;
  const uploadedFile = {
    name: file.name,
    type: file.type,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer,
  } as unknown as File;
  return { formData: async () => ({ get: (name: string) => name === "image" ? uploadedFile : null }) } as unknown as Request;
}

describe("POST /api/admin/productos/:id/image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermission.mockResolvedValue(actor);
    uploadProductImageBytes.mockResolvedValue({
      key: "catalog/products/fresa-salvaje/uuid-fresa.jpg",
      url: "https://images.example.com/catalog/products/fresa-salvaje/uuid-fresa.jpg",
    });
    updateProductImage.mockResolvedValue(undefined);
    getProductById.mockResolvedValue(product);
  });

  it("requiere productos.write y conserva los códigos de autorización", async () => {
    requirePermission.mockRejectedValueOnce(Object.assign(new Error("Prohibido"), { status: 403 }));

    const response = await POST(requestWithFile({ body: "x", name: "fresa.jpg", type: "image/jpeg" }), { params: Promise.resolve({ id: "fresa-salvaje" }) });

    expect(response.status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), "productos.write");
  });

  it("rechaza un archivo sin tipo permitido o demasiado grande", async () => {
    const unsupportedResponse = await POST(requestWithFile({ body: "x", name: "fresa.gif", type: "image/gif" }), { params: Promise.resolve({ id: "fresa-salvaje" }) });
    expect(unsupportedResponse).toMatchObject({ status: 422 });
    await expect(POST(requestWithFile({ body: new Uint8Array(5 * 1024 * 1024 + 1), name: "fresa.jpg", type: "image/jpeg" }), { params: Promise.resolve({ id: "fresa-salvaje" }) })).resolves.toMatchObject({ status: 413 });
    expect(uploadProductImageBytes).not.toHaveBeenCalled();
  });

  it("sube primero y actualiza solo la imagen con auditoría", async () => {
    const response = await POST(requestWithFile({ body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), name: "fresa.jpg", type: "image/jpeg" }), { params: Promise.resolve({ id: "fresa-salvaje" }) });

    expect(response.status).toBe(200);
    expect(uploadProductImageBytes).toHaveBeenCalledWith({ bytes: expect.any(Uint8Array), filename: "fresa.jpg", contentType: "image/jpeg" }, "fresa-salvaje");
    expect(updateProductImage).toHaveBeenCalledWith("fresa-salvaje", "https://images.example.com/catalog/products/fresa-salvaje/uuid-fresa.jpg", actor.uid);
    await expect(response.json()).resolves.toEqual({ product: { ...product, image: "https://images.example.com/catalog/products/fresa-salvaje/uuid-fresa.jpg" } });
  });

  it("borra por clave versionada y registra el fallo de limpieza sin reemplazar el error original", async () => {
    updateProductImage.mockRejectedValueOnce(new Error("Firestore indisponible"));
    deleteProductImage.mockRejectedValueOnce(new Error("detalle interno no publicable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const response = await POST(requestWithFile({ body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), name: "fresa.jpg", type: "image/jpeg" }), { params: Promise.resolve({ id: "fresa-salvaje" }) });

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: "Firestore indisponible" });
      expect(deleteProductImage).toHaveBeenCalledWith("catalog/products/fresa-salvaje/uuid-fresa.jpg");
      expect(consoleError).toHaveBeenCalledWith("[catalog-image-cleanup]", { productId: "fresa-salvaje", key: "catalog/products/fresa-salvaje/uuid-fresa.jpg" });
      expect(consoleError.mock.calls.flat().join(" ")).not.toContain("detalle interno no publicable");
    } finally {
      consoleError.mockRestore();
    }
  });

  it("permite reemplazar la imagen a un caller con write aunque no tenga read explícito", async () => {
    const response = await POST(requestWithFile({ body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), name: "fresa.jpg", type: "image/jpeg" }), { params: Promise.resolve({ id: "fresa-salvaje" }) });

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), "productos.write");
    expect(actor.permissions).not.toContain("productos.read");
  });

  it("rechaza bytes arbitrarios aunque el MIME y la extensión sean JPEG", async () => {
    const response = await POST(requestWithFile({ body: new Uint8Array([1, 2, 3]), name: "fresa.jpg", type: "image/jpeg" }), { params: Promise.resolve({ id: "fresa-salvaje" }) });

    expect(response.status).toBe(422);
    expect(uploadProductImageBytes).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/productos/:id/image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermission.mockResolvedValue(actor);
    updateProductImage.mockResolvedValue(undefined);
    getProductById.mockResolvedValue(product);
  });

  it("requiere productos.write", async () => {
    requirePermission.mockRejectedValueOnce(Object.assign(new Error("Prohibido"), { status: 403 }));
    const response = await DELETE(new Request("https://example.com"), { params: Promise.resolve({ id: "fresa-salvaje" }) });
    expect(response.status).toBe(403);
  });

  it("restablece la imagen al placeholder honesto de marca", async () => {
    const response = await DELETE(new Request("https://example.com"), { params: Promise.resolve({ id: "fresa-salvaje" }) });
    expect(response.status).toBe(200);
    expect(updateProductImage).toHaveBeenCalledWith("fresa-salvaje", "/catalog-placeholder.svg", actor.uid);
    await expect(response.json()).resolves.toEqual({
      product: { ...product, image: "/catalog-placeholder.svg" },
    });
  });

  it("devuelve 404 si el producto no existe", async () => {
    getProductById.mockResolvedValueOnce(null);
    const response = await DELETE(new Request("https://example.com"), { params: Promise.resolve({ id: "inexistente" }) });
    expect(response.status).toBe(404);
  });
});
