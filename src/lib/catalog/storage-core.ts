import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  assertCatalogProductId,
  assertPaymentProofOrderId,
  assertSafeImageFilename,
  assertSafeTenantSegment,
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

function sanitizeAssetFilename(filename: string, fallbackStem: string): string {
  assertSafeImageFilename(filename);
  const normalized = filename.replaceAll("\\", "/");
  const base = path.posix.basename(normalized);
  const rawExt = path.posix.extname(base);
  const ext = rawExt.toLowerCase();
  const rawStem = path.posix.basename(base, rawExt);
  const cleanStem =
    rawStem
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || fallbackStem;

  return `${cleanStem}${ext}`;
}

export function paymentProofImageKey(orderId: string, filename: string, negocioId?: string): string {
  assertPaymentProofOrderId(orderId);
  const safeFile = sanitizeAssetFilename(filename, "comprobante");

  if (negocioId && negocioId !== "coctels-ops") {
    assertSafeTenantSegment(negocioId);
    return `tenants/${negocioId}/payment-proofs/${orderId}/${randomUUID()}-${safeFile}`;
  }

  return `orders/payment-proofs/${orderId}/${randomUUID()}-${safeFile}`;
}

export function tenantBrandingImageKey(
  negocioId: string,
  filename: string,
  assetType: "logo" | "banner" = "logo",
): string {
  assertSafeTenantSegment(negocioId);
  const safeFile = sanitizeAssetFilename(filename, assetType);
  return `tenants/${negocioId}/branding/${assetType}/${randomUUID()}-${safeFile}`;
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

export async function uploadPaymentProofImageBytes(
  input: { bytes: Uint8Array; filename: string; contentType: string },
  orderId: string,
  store: CatalogImageStore,
  options?: { negocioId?: string },
): Promise<{ key: string; url: string }> {
  validateProductImageBytes(input);
  const key = paymentProofImageKey(orderId, input.filename, options?.negocioId);

  await store.put({
    key,
    bytes: input.bytes,
    contentType: input.contentType,
  });

  return { key, url: store.publicUrl(key) };
}

export async function uploadTenantBrandingImageBytes(
  input: { bytes: Uint8Array; filename: string; contentType: string },
  negocioId: string,
  store: CatalogImageStore,
  options?: { assetType?: "logo" | "banner" },
): Promise<{ key: string; url: string }> {
  validateProductImageBytes(input);
  const key = tenantBrandingImageKey(negocioId, input.filename, options?.assetType ?? "logo");

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
