import { notFound } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { Clock, MapPin, MessageCircle, Sparkles } from "lucide-react";

import { getNegocioBySlug } from "@/lib/firestore/tenant";
import { listActiveProductsByNegocio, listActiveProducts } from "@/lib/firestore/products";
import { listCategories } from "@/lib/firestore/categories";
import ProductCatalogBrowser from "@/components/products/ProductCatalogBrowser";
import TableServiceBanner from "@/components/products/TableServiceBanner";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ mesa?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const negocio = await getNegocioBySlug(slug);
  if (!negocio) return { title: "Local no encontrado — Coctels OPS" };

  return {
    title: `${negocio.name} — Coctels OPS`,
    description: negocio.description || negocio.branding.slogan,
  };
}

export default async function TenantStorefrontPage({ params, searchParams }: Props) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams ? searchParams : Promise.resolve(undefined),
  ]);
  const mesa = typeof resolvedSearchParams?.mesa === "string" ? resolvedSearchParams.mesa : undefined;
  const negocio = await getNegocioBySlug(slug);

  if (!negocio) {
    notFound();
  }

  const [tenantProducts, categories] = await Promise.all([
    listActiveProductsByNegocio(negocio.id),
    listCategories(),
  ]);

  const products = tenantProducts.length > 0 ? tenantProducts : await listActiveProducts();

  const whatsappUrl = `https://wa.me/${negocio.configuracion.whatsappNumber}?text=${encodeURIComponent(
    `¡Hola ${negocio.name}! Quisiera hacer un pedido desde su tienda en línea.`,
  )}`;

  return (
    <div className="container mx-auto px-4 py-6 md:py-10 space-y-8">
      {/* Banner de Servicio en Mesa / Barra si fue escaneado por QR */}
      <TableServiceBanner initialMesa={mesa} />

      {/* Header Local Mobile-First con Branding */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-b from-card/60 to-black/80 p-6 md:p-8 backdrop-blur-xl shadow-[0_0_40px_rgba(229,25,110,0.12)] max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
          <div className="relative w-24 h-24 md:w-28 md:h-28 rounded-2xl overflow-hidden border-2 border-primary/40 bg-black/60 shadow-lg shrink-0">
            <Image
              src={negocio.branding.logoUrl || "/logo.png"}
              alt={`Logo de ${negocio.name}`}
              fill
              sizes="(max-width: 768px) 96px, 112px"
              className="object-cover"
              priority
            />
          </div>

          <div className="space-y-2 flex-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-bold tracking-wider uppercase">
              <Sparkles className="w-3.5 h-3.5" />
              Sede Oficial • {negocio.name}
            </div>

            <h1 className="text-2xl md:text-4xl font-headline font-black text-white tracking-tight uppercase">
              {negocio.name}
            </h1>

            <p className="text-xs md:text-sm text-cyan-400 font-medium">
              {negocio.branding.slogan}
            </p>

            <p className="text-xs text-muted-foreground line-clamp-2 max-w-xl">
              {negocio.description}
            </p>
          </div>

          <div className="shrink-0 w-full sm:w-auto">
            <Button
              asChild
              size="lg"
              className="w-full sm:w-auto rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold min-h-[44px] px-6 text-xs uppercase tracking-wider shadow-lg active:scale-95 transition-all"
            >
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label="Pedir por WhatsApp al local">
                <MessageCircle className="w-4 h-4 mr-2" />
                WhatsApp Directo
              </a>
            </Button>
          </div>
        </div>

        {/* Info Operativa del Local: Zonas y Horarios */}
        <div className="mt-6 pt-5 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 justify-center sm:justify-start">
            <MapPin className="w-4 h-4 text-primary shrink-0" />
            <span>
              <strong className="text-white">Zonas:</strong> {negocio.configuracion.deliveryZones.join(", ")}
            </span>
          </div>

          <div className="flex items-center gap-2 justify-center sm:justify-start">
            <Clock className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>
              <strong className="text-white">Entrega estimada:</strong> ~{negocio.configuracion.estimatedDeliveryMinutes} min
            </span>
          </div>
        </div>
      </div>

      {/* Catálogo de Productos y Selector Continuo */}
      <div className="max-w-6xl mx-auto">
        <ProductCatalogBrowser products={products} categories={categories} />
      </div>
    </div>
  );
}

