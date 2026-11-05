import path from "node:path";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const DEFAULT_CATALOG_PLACEHOLDER = "/catalog-placeholder.svg";

const IMAGE_CONTENT_TYPES = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

export class CatalogImageError extends Error {
  readonly status: 413 | 422;

  constructor(message: string, status: 413 | 422 = 422) {
    super(message);
    this.name = "CatalogImageError";
    this.status = status;
  }
}

export function assertCatalogProductId(productId: string): void {
  if (!/^[a-z0-9-]+$/.test(productId)) throw new CatalogImageError("El identificador del producto no es válido");
}

export function assertSafeImageFilename(filename: string): void {
  if (!filename || filename.startsWith("/") || filename.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(filename)) {
    throw new CatalogImageError("El nombre de archivo no es una ruta relativa segura");
  }

  const segments = filename.split(/[\\/]/);
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new CatalogImageError("El nombre de archivo no es una ruta relativa segura");
  }
}

export function contentTypeForFilename(filename: string): string {
  const contentType = IMAGE_CONTENT_TYPES.get(path.extname(filename).toLocaleLowerCase());
  if (!contentType) throw new CatalogImageError("Solo se aceptan imágenes JPEG, PNG o WebP");
  return contentType;
}

export function detectImageContentType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  const hasPrefix = (prefix: number[], offset = 0): boolean =>
    bytes.length >= offset + prefix.length && prefix.every((value, index) => bytes[offset + index] === value);

  if (hasPrefix([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (hasPrefix([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (hasPrefix([0x52, 0x49, 0x46, 0x46]) && hasPrefix([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";

  return null;
}

export function isImageWithinLimit(bytes: Uint8Array): boolean {
  return bytes.byteLength <= MAX_IMAGE_BYTES;
}

export function validateProductImageContent(bytes: Uint8Array, contentType: string): void {
  const detected = detectImageContentType(bytes);
  if (!detected || detected !== contentType) {
    throw new CatalogImageError("El contenido no corresponde a una imagen JPEG, PNG o WebP válida");
  }
}

export function validateProductImageBytes(input: { bytes: Uint8Array; filename: string; contentType: string }): void {
  assertSafeImageFilename(input.filename);
  const expectedContentType = contentTypeForFilename(input.filename);
  if (input.contentType !== expectedContentType) throw new CatalogImageError("El tipo de imagen no coincide con el archivo");
  if (input.bytes.byteLength > MAX_IMAGE_BYTES) throw new CatalogImageError("La imagen supera el máximo de 5 MB", 413);
  validateProductImageContent(input.bytes, input.contentType);
}
