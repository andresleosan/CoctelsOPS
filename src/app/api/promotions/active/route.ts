export const dynamic = "force-dynamic";

import { getActivePromotions } from "@/lib/firestore/promotions";
import type { ActivePromotionsResponse } from "@/types/promotions";

export async function GET(): Promise<Response> {
  try {
    const nowIso = new Date().toISOString();
    const { activeHappyHours, todayScheduled } = await getActivePromotions(nowIso);

    // Mapear solo campos públicos para el storefront de clientes
    const sanitize = (p: (typeof activeHappyHours)[number]) => ({
      id: p.id,
      code: p.code,
      title: p.title || (p.discountType === "2x1" ? "¡Happy Hour 2x1!" : "¡Happy Hour Especial!"),
      description: p.description || "",
      discountType: p.discountType,
      discountValue: p.discountValue,
      minimumSubtotal: p.minimumSubtotal,
      productIds: p.productIds || [],
      categoryIds: p.categoryIds || [],
      schedule: p.schedule,
      isAutomatic: p.isAutomatic ?? true,
    });

    const responseData: ActivePromotionsResponse = {
      activeHappyHours: activeHappyHours.map(sanitize) as never,
      todayScheduled: todayScheduled.map(sanitize) as never,
      serverTime: nowIso,
    };

    return Response.json(responseData);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Error al obtener promociones activas" },
      { status: 500 }
    );
  }
}
