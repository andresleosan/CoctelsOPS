import { z } from "zod";

import { hasPermission, requirePermission, resolvePermissions } from "@/lib/auth/permissions";
import { toAuthorizationResponse, verifyRequest } from "@/lib/auth/verify-request";
import {
  CatalogImageError,
  MAX_IMAGE_BYTES,
  assertSafeImageFilename,
  contentTypeForFilename,
  deleteOrderPaymentProof,
  detectImageContentType,
  uploadOrderPaymentProofBytes,
} from "@/lib/catalog/storage";
import {
  OrderNotFoundError,
  attachOrderPaymentProof,
  getOrderForPaymentProofUpload,
  updateOrderPaymentVerification,
} from "@/lib/firestore/orders";
import { toCustomerOrder } from "@/lib/orders/customer-order";
import {
  OrderValidationError,
  paymentProofMetadataSchema,
  verifyOrderPaymentSchema,
} from "@/lib/validation/orders";
import type { Order } from "@/types/orders";

type RouteContext = { params: Promise<{ id: string }> };

function toProofResponse(error: unknown): Response {
  if (error instanceof CatalogImageError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (
    error instanceof SyntaxError ||
    error instanceof z.ZodError ||
    error instanceof OrderValidationError ||
    (error instanceof Error && error.name === "ZodError")
  ) {
    const message =
      error instanceof SyntaxError
        ? "El cuerpo de la solicitud no es un JSON valido"
        : error instanceof z.ZodError
          ? error.issues[0]?.message
          : (error as Error).message;
    return Response.json(
      { error: message ?? "Los datos del comprobante no son validos" },
      { status: 422 },
    );
  }
  if (error instanceof OrderNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  return toAuthorizationResponse(error);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    let actor = await verifyRequest(request as never);
    if (
      actor.profile &&
      actor.profile.accountType !== "admin" &&
      Array.isArray(actor.profile.roleIds) &&
      actor.profile.roleIds.length > 0 &&
      (!actor.profile.permissions || actor.profile.permissions.length === 0) &&
      typeof resolvePermissions === "function"
    ) {
      const permissions = await resolvePermissions(actor.profile);
      actor = {
        ...actor,
        permissions,
        profile: { ...actor.profile, permissions },
      };
    }

    const { id } = await context.params;
    const existingOrder = await getOrderForPaymentProofUpload(actor, id);

    const formData = await request.formData();
    const fileValue = formData.get("comprobante") ?? formData.get("image");
    if (
      !fileValue ||
      typeof fileValue !== "object" ||
      typeof (fileValue as Blob).arrayBuffer !== "function"
    ) {
      return Response.json(
        { error: "Debes adjuntar una imagen del comprobante" },
        { status: 422 },
      );
    }

    const rawChannel = formData.get("channel");
    const rawReference = formData.get("reference");
    const metadata = paymentProofMetadataSchema.parse({
      channel:
        typeof rawChannel === "string" && rawChannel.trim() ? rawChannel.trim() : undefined,
      reference:
        typeof rawReference === "string" && rawReference.trim() ? rawReference.trim() : undefined,
    });

    const file = fileValue as File;
    if (file.size > MAX_IMAGE_BYTES) {
      return Response.json(
        { error: "El comprobante supera el máximo de 5 MB" },
        { status: 413 },
      );
    }
    if (!file.name) {
      return Response.json(
        { error: "El archivo debe incluir un nombre válido" },
        { status: 422 },
      );
    }

    assertSafeImageFilename(file.name);
    const expectedType = contentTypeForFilename(file.name);
    const normalizedFileType = file.type ? file.type.trim().toLowerCase() : "";
    if (normalizedFileType && normalizedFileType !== expectedType) {
      return Response.json(
        { error: "Solo se aceptan imágenes JPEG, PNG o WebP" },
        { status: 422 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength === 0) {
      return Response.json(
        { error: "El comprobante no puede estar vacío" },
        { status: 422 },
      );
    }
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return Response.json(
        { error: "El comprobante supera el máximo de 5 MB" },
        { status: 413 },
      );
    }

    const detectedType = detectImageContentType(bytes);
    if (!detectedType || detectedType !== expectedType) {
      return Response.json(
        { error: "El contenido no corresponde a una imagen JPEG, PNG o WebP válida" },
        { status: 422 },
      );
    }

    const uploaded = await uploadOrderPaymentProofBytes(
      {
        bytes,
        filename: file.name,
        contentType: detectedType,
      },
      existingOrder.id,
      existingOrder.negocioId ? { negocioId: existingOrder.negocioId } : undefined,
    );

    let attached: { order: Order; previousProofKey?: string };
    try {
      attached = await attachOrderPaymentProof(actor, existingOrder.id, {
        url: uploaded.url,
        key: uploaded.key,
        contentType: detectedType,
        channel: metadata.channel,
        reference: metadata.reference,
      });
    } catch (error) {
      try {
        await deleteOrderPaymentProof(uploaded.key);
      } catch {
        console.error("[order-payment-proof-cleanup]", {
          orderId: existingOrder.id,
          key: uploaded.key,
        });
      }
      throw error;
    }

    if (attached.previousProofKey && attached.previousProofKey !== uploaded.key) {
      try {
        await deleteOrderPaymentProof(attached.previousProofKey);
      } catch {
        console.error("[order-payment-proof-cleanup]", {
          orderId: existingOrder.id,
          key: attached.previousProofKey,
        });
      }
    }

    const canViewAdmin = Boolean(actor.profile && hasPermission(actor.profile, "pedidos.read"));
    if (canViewAdmin) {
      return Response.json(
        {
          order: attached.order,
          paymentProof: attached.order.paymentProof,
          paymentVerificationStatus: attached.order.paymentVerificationStatus,
        },
        { status: 201 },
      );
    }

    const customerOrder = toCustomerOrder(attached.order);
    return Response.json(
      {
        order: customerOrder,
        paymentProof: customerOrder.paymentProof,
        paymentVerificationStatus: customerOrder.paymentVerificationStatus,
      },
      { status: 201 },
    );
  } catch (error) {
    return toProofResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const actor = await requirePermission(request as never, "pedidos.update");
    const { id } = await context.params;
    const input = verifyOrderPaymentSchema.parse(await request.json());
    const order = await updateOrderPaymentVerification(actor, id, input);
    return Response.json({
      order,
      paymentVerificationStatus: order.paymentVerificationStatus,
      paymentVerification: order.paymentVerification,
    });
  } catch (error) {
    return toProofResponse(error);
  }
}
