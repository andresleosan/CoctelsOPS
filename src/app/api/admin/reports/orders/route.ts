import { z } from "zod";

import { isGlobalAdmin, requirePermission } from "@/lib/auth/permissions";
import { toAuthorizationResponse } from "@/lib/auth/verify-request";
import { generateOrderReport, orderReportFilterSchema } from "@/lib/reports/order-report";
import { DEFAULT_TENANT_ID } from "@/types/tenant";

export async function GET(request: Request): Promise<Response> {
  try {
    const caller = await requirePermission(request as never, "reportes.read");
    const params = new URL(request.url).searchParams;
    const filter = orderReportFilterSchema.parse({ from: params.get("from") ?? undefined, to: params.get("to") ?? undefined, status: params.get("status") ?? undefined });
    const negocioId = caller.profile.negocioId?.trim() || DEFAULT_TENANT_ID;
    const enforceTenantFilter = !isGlobalAdmin(caller);
    return Response.json({
      report: await generateOrderReport(filter, {
        negocioId,
        enforceTenantFilter,
        includeCatalogProfitability: true,
      }),
    });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Los filtros no son válidos" }, { status: 422 });
    return toAuthorizationResponse(error);
  }
}
