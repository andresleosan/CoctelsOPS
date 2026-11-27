import "server-only";

import { getStoreConfiguration } from "@/lib/firestore/configuration";
import { listPublicBarDisplayOrders } from "@/lib/firestore/orders";
import { getNegocioById, getNegocioBySlug } from "@/lib/firestore/tenant";
import type { BarDisplaySnapshot } from "@/types/display";
import { DEFAULT_TENANT_ID } from "@/types/tenant";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const cleanSlug = url.searchParams.get("slug")?.trim() || "";
    const cleanNegocioId = url.searchParams.get("negocioId")?.trim() || "";

    let resolvedNegocioId = DEFAULT_TENANT_ID;
    let resolvedSlug: string | undefined;
    let storeName = "Coctels OPS";
    let logoUrl: string | undefined;
    let primaryColor: string | undefined;
    let accentColor: string | undefined;
    let emergencyPauseActive = false;
    let emergencyPauseReason: string | undefined;

    if (cleanSlug) {
      const negocio = await getNegocioBySlug(cleanSlug);
      if (!negocio) {
        return Response.json(
          { error: "El local especificado no está disponible." },
          { status: 404, headers: NO_STORE_HEADERS },
        );
      }
      resolvedNegocioId = negocio.id;
      resolvedSlug = negocio.slug;
      storeName = negocio.name;
      logoUrl = negocio.branding?.logoUrl?.trim() || undefined;
      primaryColor = negocio.branding?.primaryColor?.trim() || undefined;
      accentColor = negocio.branding?.accentColor?.trim() || undefined;
      emergencyPauseActive = Boolean(negocio.configuracion?.emergencyPause?.active);
      emergencyPauseReason = negocio.configuracion?.emergencyPause?.reason?.trim() || undefined;
    } else if (cleanNegocioId && cleanNegocioId !== DEFAULT_TENANT_ID) {
      const negocio = await getNegocioById(cleanNegocioId);
      if (!negocio || !negocio.active) {
        return Response.json(
          { error: "El local especificado no está disponible." },
          { status: 404, headers: NO_STORE_HEADERS },
        );
      }
      resolvedNegocioId = negocio.id;
      resolvedSlug = negocio.slug;
      storeName = negocio.name;
      logoUrl = negocio.branding?.logoUrl?.trim() || undefined;
      primaryColor = negocio.branding?.primaryColor?.trim() || undefined;
      accentColor = negocio.branding?.accentColor?.trim() || undefined;
      emergencyPauseActive = Boolean(negocio.configuracion?.emergencyPause?.active);
      emergencyPauseReason = negocio.configuracion?.emergencyPause?.reason?.trim() || undefined;
    } else {
      const config = await getStoreConfiguration({ allowDefaults: true });
      emergencyPauseActive = Boolean(config.emergencyPause?.active);
      emergencyPauseReason = config.emergencyPause?.reason?.trim() || undefined;
    }

    const { preparing, ready } = await listPublicBarDisplayOrders(resolvedNegocioId);

    const snapshot: BarDisplaySnapshot = {
      negocioId: resolvedNegocioId,
      ...(resolvedSlug ? { slug: resolvedSlug } : {}),
      storeName,
      ...(logoUrl ? { logoUrl } : {}),
      ...(primaryColor ? { primaryColor } : {}),
      ...(accentColor ? { accentColor } : {}),
      emergencyPauseActive,
      ...(emergencyPauseActive && emergencyPauseReason ? { emergencyPauseReason } : {}),
      preparing,
      ready,
      updatedAt: new Date().toISOString(),
    };

    return Response.json(snapshot, { status: 200, headers: NO_STORE_HEADERS });
  } catch {
    return Response.json(
      { error: "No fue posible cargar la pantalla de turnos en barra." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
