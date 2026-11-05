import { z } from "zod";

import { requirePermission } from "@/lib/auth/permissions";
import { toAuthorizationResponse } from "@/lib/auth/verify-request";
import { deleteProduct, getProductById, patchProduct, updateProduct } from "@/lib/firestore/products";
import { productInputSchema, productPatchSchema } from "@/lib/validation/catalog";

type Context = { params: Promise<{ id: string }> };
function errorResponse(error: unknown): Response {
  if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message ?? "Producto inválido" }, { status: 422 });
  return toAuthorizationResponse(error);
}

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const caller = await requirePermission(request as never, "productos.read");
    const { id } = await context.params;
    const product = await getProductById(id, { includeInactive: true, caller });
    return product ? Response.json({ product }) : Response.json({ error: "Producto no encontrado" }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    const caller = await requirePermission(request as never, "productos.write");
    const { id } = await context.params;
    const json = await request.json();

    const fullParse = productInputSchema.safeParse(json);
    if (fullParse.success) {
      await updateProduct(id, fullParse.data, caller);
      const product = await getProductById(id, { includeInactive: true, caller });
      return Response.json({ product });
    }

    const patchParse = productPatchSchema.safeParse(json);
    if (!patchParse.success) {
      return Response.json({ error: patchParse.error.issues[0]?.message ?? "Datos inválidos" }, { status: 422 });
    }

    const product = await patchProduct(id, patchParse.data, caller);
    return Response.json({ product });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    const caller = await requirePermission(request as never, "productos.write");
    await deleteProduct((await context.params).id, caller);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
