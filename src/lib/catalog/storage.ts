import "server-only";

import { getR2CatalogImageStore } from "@/lib/catalog/r2-client";
import { readValidatedLocalProductImage } from "@/lib/catalog/local-images";
import {
  deleteCatalogImage,
  uploadCatalogImageBytes,
  uploadPaymentProofImageBytes,
  uploadTenantBrandingImageBytes,
} from "@/lib/catalog/storage-core";

export {
  CatalogImageError,
  DEFAULT_CATALOG_PLACEHOLDER,
  MAX_IMAGE_BYTES,
  assertSafeImageFilename,
  contentTypeForFilename,
  detectImageContentType,
  isImageWithinLimit,
  validateProductImageContent,
} from "@/lib/catalog/image-validation";

export {
  catalogImageKey,
  paymentProofImageKey,
  tenantBrandingImageKey,
} from "@/lib/catalog/storage-core";

export async function validateLocalProductImage(imageFile: string): Promise<void> {
  await readValidatedLocalProductImage(imageFile);
}

export async function uploadProductImageBytes(
  input: { bytes: Uint8Array; filename: string; contentType: string },
  productId: string,
  options?: { negocioId?: string },
): Promise<{ key: string; url: string }> {
  return uploadCatalogImageBytes(input, productId, getR2CatalogImageStore(), options);
}

export async function deleteProductImage(key: string): Promise<void> {
  return deleteCatalogImage(key, getR2CatalogImageStore());
}

export async function uploadOrderPaymentProofBytes(
  input: { bytes: Uint8Array; filename: string; contentType: string },
  orderId: string,
  options?: { negocioId?: string },
): Promise<{ key: string; url: string }> {
  return uploadPaymentProofImageBytes(input, orderId, getR2CatalogImageStore(), options);
}

export async function deleteOrderPaymentProof(key: string): Promise<void> {
  return deleteCatalogImage(key, getR2CatalogImageStore());
}

export async function uploadTenantLogoBytes(
  input: { bytes: Uint8Array; filename: string; contentType: string },
  negocioId: string,
): Promise<{ key: string; url: string }> {
  return uploadTenantBrandingImageBytes(input, negocioId, getR2CatalogImageStore(), {
    assetType: "logo",
  });
}

export async function deleteTenantLogo(key: string): Promise<void> {
  return deleteCatalogImage(key, getR2CatalogImageStore());
}

export async function uploadLocalProductImage(
  imageFile: string,
  productId: string,
  options?: { negocioId?: string },
): Promise<{ key: string; url: string }> {
  const image = await readValidatedLocalProductImage(imageFile);
  return uploadProductImageBytes(image, productId, options);
}
