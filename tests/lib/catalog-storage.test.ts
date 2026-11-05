import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";

const { put, remove, publicUrl, readFile, stat, realpath } = vi.hoisted(() => ({
  put: vi.fn(),
  remove: vi.fn(),
  publicUrl: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
  realpath: vi.fn(),
}));
const { createR2CatalogImageStore } = vi.hoisted(() => ({ createR2CatalogImageStore: vi.fn() }));
const store = { put, remove, publicUrl };

vi.mock("@aws-sdk/client-s3", () => ({
  DeleteObjectCommand: vi.fn(function (input: unknown) { return { input }; }),
  PutObjectCommand: vi.fn(function (input: unknown) { return { input }; }),
  S3Client: vi.fn(function () { return { send: vi.fn().mockResolvedValue({}) }; }),
}));
vi.mock("@/lib/catalog/r2-client", () => ({ getR2CatalogImageStore: () => store }));
vi.mock("../../src/lib/catalog/r2-store-core", () => ({ createR2CatalogImageStore }));
vi.mock("node:fs/promises", () => ({ default: { readFile, stat, realpath }, readFile, stat, realpath }));

import {
  DEFAULT_CATALOG_PLACEHOLDER,
  MAX_IMAGE_BYTES,
  deleteProductImage,
  detectImageContentType,
  isImageWithinLimit,
  uploadProductImageBytes,
  validateLocalProductImage,
} from "@/lib/catalog/storage";
import { deleteProductImage as deleteCliProductImage, uploadProductImageBytes as uploadCliProductImageBytes } from "../../scripts/catalog/import-adapter";

describe("Storage de imágenes de catálogo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    put.mockResolvedValue(undefined);
    remove.mockResolvedValue(undefined);
    publicUrl.mockImplementation((key: string) => `https://img.example.com/${key}`);
    stat.mockResolvedValue({ isFile: () => true, size: 4 });
    realpath.mockImplementation(async (value: string) => value);
  });

  it.each([
    ["tipo no permitido", { filename: "fresa.gif", contentType: "image/gif", bytes: new Uint8Array([1]) }],
    ["ruta absoluta", { filename: "C:/secret.jpg", contentType: "image/jpeg", bytes: new Uint8Array([1]) }],
    ["traversal", { filename: "../secret.jpg", contentType: "image/jpeg", bytes: new Uint8Array([1]) }],
    ["tamaño excedido", { filename: "fresa.jpg", contentType: "image/jpeg", bytes: new Uint8Array(5 * 1024 * 1024 + 1) }],
  ])("rechaza %s", async (_case, input) => {
    await expect(uploadProductImageBytes(input, "fresa-salvaje")).rejects.toThrow();
    expect(put).not.toHaveBeenCalled();
  });

  it("sube y devuelve una URL de R2", async () => {
    const result = await uploadProductImageBytes({
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      filename: "fresa.jpg",
      contentType: "image/jpeg",
    }, "fresa-salvaje");

    expect(result.key).toMatch(/^catalog\/products\/fresa-salvaje\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-fresa\.jpg$/);
    expect(put).toHaveBeenCalledWith(expect.objectContaining({
      key: result.key,
      contentType: "image/jpeg",
    }));
    expect(result).toEqual({
      key: expect.any(String),
      url: `https://img.example.com/${result.key}`,
    });
  });

  it("borra la clave versionada exacta sin leer el archivo", async () => {
    const key = "catalog/products/fresa-salvaje/uuid-anterior-fresa.jpg";
    await deleteProductImage(key);

    expect(remove).toHaveBeenCalledWith(key);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("el CLI reutiliza la primitiva R2 compartida y su contrato versionado", async () => {
    vi.stubEnv("R2_ACCOUNT_ID", "account-test");
    vi.stubEnv("R2_BUCKET_NAME", "bucket-test");
    vi.stubEnv("R2_ACCESS_KEY_ID", "access-test");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret-test");
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://img.example.com");
    createR2CatalogImageStore.mockReturnValue(store);

    const upload = await uploadCliProductImageBytes({
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      filename: "fresa.jpg",
      contentType: "image/jpeg",
    }, "fresa-salvaje");

    expect(createR2CatalogImageStore).toHaveBeenCalledWith(expect.objectContaining({
      accountId: expect.any(String),
      bucketName: expect.any(String),
      accessKeyId: expect.any(String),
      secretAccessKey: expect.any(String),
      publicBaseUrl: expect.any(String),
    }));
    expect(upload).toEqual(expect.objectContaining({ key: expect.any(String), url: expect.any(String) }));
    await deleteCliProductImage(upload.key);
    expect(remove).toHaveBeenCalledWith(upload.key);
  });

  it.each([
    ["JPEG", "fresa.jpg", "image/jpeg", [0xff, 0xd8, 0xff, 0xd9]],
    ["PNG", "fresa.png", "image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ["WebP", "fresa.webp", "image/webp", [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]],
  ])("acepta bytes reales de %s", async (_format, filename, contentType, bytes) => {
    await expect(uploadProductImageBytes({ bytes: new Uint8Array(bytes), filename, contentType }, "fresa-salvaje")).resolves.toEqual({
      key: expect.stringMatching(new RegExp(`^catalog/products/fresa-salvaje/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-${filename.replace(".", "\\.")}$`)),
      url: expect.stringMatching(/^https:\/\/img\.example\.com\/catalog\/products\/fresa-salvaje\/[0-9a-f-]+-/),
    });
  });

  it("rechaza bytes arbitrarios aunque MIME y extensión sean válidos", async () => {
    await expect(uploadProductImageBytes({ bytes: new Uint8Array([1, 2, 3]), filename: "fresa.jpg", contentType: "image/jpeg" }, "fresa-salvaje")).rejects.toMatchObject({ status: 422 });
    expect(put).not.toHaveBeenCalled();
  });

  it.each([
    ["JPEG", "fresa.jpg", "image/jpeg", [0xff, 0xd8, 0xff, 0xd9]],
    ["PNG", "fresa.png", "image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ["WebP", "fresa.webp", "image/webp", [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]],
  ])("el dry-run acepta bytes locales reales de %s", async (_format, filename, _contentType, bytes) => {
    readFile.mockResolvedValueOnce(Buffer.from(bytes));
    stat.mockResolvedValueOnce({ isFile: () => true, size: bytes.length });

    await expect(validateLocalProductImage(filename)).resolves.toBeUndefined();
  });

  it("el dry-run rechaza bytes locales arbitrarios con extensión válida", async () => {
    readFile.mockResolvedValueOnce(Buffer.from([1, 2, 3]));
    stat.mockResolvedValueOnce({ isFile: () => true, size: 3 });

    await expect(validateLocalProductImage("fresa.jpg")).rejects.toMatchObject({ status: 422 });
  });

  it("rechaza un symlink o junction cuyo destino real queda fuera del directorio de imágenes", async () => {
    const imageDirectory = path.resolve(process.cwd(), "scripts/catalog/images");
    realpath.mockImplementation(async (value: string) => value === imageDirectory ? imageDirectory : path.resolve(process.cwd(), "outside/secret.jpg"));

    await expect(validateLocalProductImage("linked.jpg")).rejects.toMatchObject({ status: 422 });
    expect(stat).not.toHaveBeenCalled();
  });

  it("rechaza una junction o symlink que redirige la raíz de imágenes fuera del repositorio", async () => {
    const imageDirectory = path.resolve(process.cwd(), "scripts/catalog/images");
    const redirectedDirectory = path.resolve(process.cwd(), "outside/catalog-images");
    realpath.mockImplementation(async (value: string) => value === imageDirectory ? redirectedDirectory : path.join(redirectedDirectory, "fresa.jpg"));

    await expect(validateLocalProductImage("fresa.jpg")).rejects.toMatchObject({ status: 422 });
    expect(stat).not.toHaveBeenCalled();
  });

  it("detecta el tipo MIME correcto a partir de magic bytes", () => {
    expect(detectImageContentType(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBe("image/jpeg");
    expect(detectImageContentType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectImageContentType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
    expect(detectImageContentType(new Uint8Array([0x00, 0x00, 0x00, 0x00]))).toBeNull();
  });

  it("verifica límites de tamaño y placeholder por defecto", () => {
    expect(DEFAULT_CATALOG_PLACEHOLDER).toBe("/catalog-placeholder.svg");
    expect(isImageWithinLimit(new Uint8Array(MAX_IMAGE_BYTES))).toBe(true);
    expect(isImageWithinLimit(new Uint8Array(MAX_IMAGE_BYTES + 1))).toBe(false);
  });
});
