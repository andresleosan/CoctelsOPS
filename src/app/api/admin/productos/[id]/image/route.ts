import { requirePermission } from "@/lib/auth/permissions";
import { toAuthorizationResponse } from "@/lib/auth/verify-request";
import {
  CatalogImageError,
  DEFAULT_CATALOG_PLACEHOLDER,
  MAX_IMAGE_BYTES,
  deleteProductImage,
  uploadProductImageBytes,
  validateProductImageContent,
} from "@/lib/catalog/storage";
import { getProductById, updateProductImage } from "@/lib/firestore/products";
import path from "node:path";

type Context = { params: Promise<{ id: string }> };

function imageErrorResponse(error: unknown): Response {
  if (error instanceof CatalogImageError) return Response.json({ error: error.message }, { status: error.status });
  return toAuthorizationResponse(error);
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const caller = await requirePermission(request as never, "productos.write");
    const { id } = await context.params;
    const currentProduct = await getProductById(id, { includeInactive: true, caller });
    if (!currentProduct) return Response.json({ error: "Producto no encontrado" }, { status: 404 });

    const formData = await request.formData();
    const fileValue = formData.get("image");
    if (!fileValue || typeof fileValue !== "object" || typeof (fileValue as Blob).arrayBuffer !== "function") {
      return Response.json({ error: "Debes adjuntar una imagen" }, { status: 422 });
    }

    const file = fileValue as File;
    if (file.size > MAX_IMAGE_BYTES) return Response.json({ error: "La imagen supera el máximo de 5 MB" }, { status: 413 });
    const expectedTypes: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
    if (!file.name || !file.type || expectedTypes[path.extname(file.name).toLocaleLowerCase()] !== file.type) {
      return Response.json({ error: "Solo se aceptan imágenes JPEG, PNG o WebP" }, { status: 422 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    validateProductImageContent(bytes, file.type);
    const image = await uploadProductImageBytes({
      bytes,
      filename: file.name,
      contentType: file.type,
    }, id);
    try {
      await updateProductImage(id, image.url, caller.uid);
    } catch (error) {
      try {
        await deleteProductImage(image.key);
      } catch {
        console.error("[catalog-image-cleanup]", { productId: id, key: image.key });
      }
      throw error;
    }
    return Response.json({ product: { ...currentProduct, image: image.url } });
  } catch (error) {
    return imageErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    const caller = await requirePermission(request as never, "productos.write");
    const { id } = await context.params;
    const currentProduct = await getProductById(id, { includeInactive: true, caller });
    if (!currentProduct) return Response.json({ error: "Producto no encontrado" }, { status: 404 });

    await updateProductImage(id, DEFAULT_CATALOG_PLACEHOLDER, caller.uid);
    return Response.json({ product: { ...currentProduct, image: DEFAULT_CATALOG_PLACEHOLDER } });
  } catch (error) {
    return imageErrorResponse(error);
  }
}
