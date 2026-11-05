import { randomUUID } from "node:crypto";

import {
  assertCatalogProductId,
  assertSafeImageFilename,
  validateProductImageBytes,
} from "@/lib/catalog/image-validation";
import type { CatalogImageStore } from "@/lib/catalog/r2-store-core";

export function catalogImageKey(productId: string, filename: string, negocioId?: string): string {
  assertCatalogProductId(productId);
  assertSafeImageFilename(filename);

  const cleanFilename = filename.replaceAll("\\", "/");
  if (negocioId && negocioId !== "coctels-ops") {
    return `tenants/${negocioId}/products/${productId}/${randomUUID()}-${cleanFilename}`;
  }

  return `catalog/products/${productId}/${randomUUID()}-${cleanFilename}`;
}

export async function uploadCatalogImageBytes(
  input: { bytes: Uint8Array; filename: string; contentType: string },
  productId: string,
  store: CatalogImageStore,
  options?: { negocioId?: string },
): Promise<{ key: string; url: string }> {
  validateProductImageBytes(input);
  const key = catalogImageKey(productId, input.filename, options?.negocioId);

  await store.put({
    key,
    bytes: input.bytes,
    contentType: input.contentType,
  });

  return { key, url: store.publicUrl(key) };
}

export async function deleteCatalogImage(
  key: string,
  store: CatalogImageStore,
): Promise<void> {
  await store.remove(key);
}
