import path from "node:path";

import { requireNegocioAccess, requirePermission } from "@/lib/auth/permissions";
import { toAuthorizationResponse } from "@/lib/auth/verify-request";
import {
  CatalogImageError,
  DEFAULT_CATALOG_PLACEHOLDER,
  MAX_IMAGE_BYTES,
  deleteTenantLogo,
  uploadTenantLogoBytes,
  validateProductImageContent,
} from "@/lib/catalog/storage";
import {
  TenantNotFoundError,
  getNegocioById,
  updateNegocio,
} from "@/lib/firestore/tenant";

type Context = { params: Promise<{ id: string }> };

function errorResponse(error: unknown): Response {
  if (error instanceof CatalogImageError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof TenantNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  return toAuthorizationResponse(error);
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const caller = await requirePermission(request as never, "configuracion.write");
    const { id } = await context.params;
    requireNegocioAccess(caller, id);

    const currentNegocio = await getNegocioById(id);
    if (!currentNegocio) {
      return Response.json({ error: "Negocio no encontrado" }, { status: 404 });
    }

    const formData = await request.formData();
    const fileValue = formData.get("logo") ?? formData.get("image");
    if (
      !fileValue ||
      typeof fileValue !== "object" ||
      typeof (fileValue as Blob).arrayBuffer !== "function"
    ) {
      return Response.json({ error: "Debes adjuntar una imagen para el logo" }, { status: 422 });
    }

    const file = fileValue as File;
    if (file.size > MAX_IMAGE_BYTES) {
      return Response.json({ error: "La imagen supera el máximo de 5 MB" }, { status: 413 });
    }

    const expectedTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    };
    if (
      !file.name ||
      !file.type ||
      expectedTypes[path.extname(file.name).toLocaleLowerCase()] !== file.type
    ) {
      return Response.json(
        { error: "Solo se aceptan imágenes JPEG, PNG o WebP" },
        { status: 422 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    validateProductImageContent(bytes, file.type);

    const uploaded = await uploadTenantLogoBytes(
      {
        bytes,
        filename: file.name,
        contentType: file.type,
      },
      id,
    );

    try {
      const updated = await updateNegocio(
        id,
        { branding: { logoUrl: uploaded.url } },
        caller,
      );
      return Response.json({ negocio: updated, logoUrl: uploaded.url });
    } catch (error) {
      try {
        await deleteTenantLogo(uploaded.key);
      } catch {
        console.error("[tenant-logo-cleanup]", { negocioId: id, key: uploaded.key });
      }
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    const caller = await requirePermission(request as never, "configuracion.write");
    const { id } = await context.params;
    requireNegocioAccess(caller, id);

    const currentNegocio = await getNegocioById(id);
    if (!currentNegocio) {
      return Response.json({ error: "Negocio no encontrado" }, { status: 404 });
    }

    const updated = await updateNegocio(
      id,
      { branding: { logoUrl: DEFAULT_CATALOG_PLACEHOLDER } },
      caller,
    );
    return Response.json({ negocio: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
