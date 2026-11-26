import {
  getStoreConfiguration,
  StoreConfigurationUnavailableError,
} from "@/lib/firestore/configuration";
import { getNegocioById, getNegocioBySlug } from "@/lib/firestore/tenant";
import { DEFAULT_TENANT_ID } from "@/types/tenant";

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug")?.trim();
    const negocioId = url.searchParams.get("negocioId")?.trim();

    if (slug) {
      const negocio = await getNegocioBySlug(slug);
      if (!negocio) {
        return Response.json({ error: "Local no encontrado" }, { status: 404 });
      }
      return Response.json({ configuration: negocio.configuracion });
    }

    if (negocioId && negocioId !== DEFAULT_TENANT_ID) {
      const negocio = await getNegocioById(negocioId);
      if (!negocio || !negocio.active) {
        return Response.json({ error: "Local no encontrado" }, { status: 404 });
      }
      return Response.json({ configuration: negocio.configuracion });
    }

    return Response.json({ configuration: await getStoreConfiguration({ allowDefaults: true }) });
  } catch (error) {
    if (error instanceof StoreConfigurationUnavailableError) {
      return Response.json({ error: error.message }, { status: 503 });
    }

    return Response.json({ error: "No fue posible completar la solicitud" }, { status: 500 });
  }
}
