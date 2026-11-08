import { z } from "zod";

import { toAuthorizationResponse, verifyRequest } from "@/lib/auth/verify-request";
import { getProductById } from "@/lib/firestore/products";
import { calculatePromotion, getPromotionByCode } from "@/lib/firestore/promotions";
import { calculateOrder, OrderValidationError } from "@/lib/validation/orders";
import type { Promotion } from "@/types/operations";

const customizationSchema = z.object({
  size: z.string().trim().min(1, "El tamaño es obligatorio").max(50),
  flavors: z.array(z.string().trim().min(1)).max(20),
  addOns: z.array(z.string().trim().min(1)).max(20),
});

const validatePromotionInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Ingresa un código promocional")
    .max(40, "El código de promoción no es válido")
    .regex(/^[A-Za-z0-9-]+$/, "El código de promoción no es válido")
    .transform((value) => value.toUpperCase()),
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1),
        quantity: z.number().int().min(1).max(50),
        customization: customizationSchema,
      })
    )
    .min(1, "El carrito no puede estar vacío")
    .max(50),
});

function formatPromotionRejectionReason(reason: string | undefined, promotion: Promotion): string {
  switch (reason) {
    case "inactiva":
      return "Esta promoción se encuentra inactiva.";
    case "vencida":
      return "Este código promocional ha expirado o aún no está vigente.";
    case "mínimo":
      return `Este cupón requiere una compra mínima de $${promotion.minimumSubtotal.toLocaleString()}.`;
    case "alcance":
      return "Este cupón no aplica para los productos seleccionados en tu carrito.";
    case "límite":
      return "Este cupón ya alcanzó su límite máximo de redenciones.";
    default:
      return "No fue posible aplicar este código promocional.";
  }
}

function toValidatePromotionErrorResponse(error: unknown): Response {
  if (
    error instanceof SyntaxError ||
    error instanceof z.ZodError ||
    error instanceof OrderValidationError ||
    (error instanceof Error && error.name === "ZodError")
  ) {
    const message =
      error instanceof SyntaxError
        ? "El cuerpo de la solicitud no es un JSON válido"
        : error instanceof z.ZodError
        ? error.issues[0]?.message
        : (error as Error).message;
    return Response.json(
      { applied: false, error: message ?? "Los datos del cupón no son válidos" },
      { status: 422 }
    );
  }
  return toAuthorizationResponse(error);
}

export async function POST(request: Request): Promise<Response> {
  try {
    await verifyRequest(request as never);
    const validated = validatePromotionInputSchema.parse(await request.json());

    const uniqueProductIds = [...new Set(validated.items.map((item) => item.productId))];
    const products = await Promise.all(uniqueProductIds.map((productId) => getProductById(productId)));
    const availableProducts = products.filter((product): product is NonNullable<typeof product> => product !== null);

    const calculated = calculateOrder(
      {
        customerName: "Validación Cupón",
        phone: "3000000000",
        address: "Validación Checkout",
        items: validated.items,
      },
      availableProducts
    );

    const promotion = await getPromotionByCode(validated.code);
    if (!promotion) {
      return Response.json(
        {
          applied: false,
          error: "El código promocional no existe o no está disponible.",
        },
        { status: 422 }
      );
    }

    const promotionResult = calculatePromotion({
      promotion,
      subtotal: calculated.subtotal,
      now: new Date().toISOString(),
      items: calculated.items.map((item) => ({
        productId: item.productId,
        category: availableProducts.find((product) => product.id === item.productId)?.category ?? "",
        subtotal: item.subtotal,
      })),
    });

    if (!promotionResult.applied) {
      return Response.json(
        {
          applied: false,
          code: promotion.code,
          reason: promotionResult.reason,
          error: formatPromotionRejectionReason(promotionResult.reason, promotion),
        },
        { status: 422 }
      );
    }

    return Response.json({
      applied: true,
      code: promotion.code,
      discountType: promotion.discountType,
      discountValue: promotion.discountValue,
      subtotal: calculated.subtotal,
      discount: promotionResult.discount,
      total: promotionResult.total,
    });
  } catch (error) {
    return toValidatePromotionErrorResponse(error);
  }
}
