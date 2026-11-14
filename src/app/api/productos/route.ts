import { listActiveProducts, listActiveProductsByNegocio } from "@/lib/firestore/products";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const negocioId = new URL(request.url).searchParams.get("negocioId")?.trim();
    const products = negocioId
      ? await listActiveProductsByNegocio(negocioId)
      : await listActiveProducts();
    return Response.json({ products });
  } catch {
    return Response.json({ error: "No fue posible cargar el catálogo de productos" }, { status: 500 });
  }
}
