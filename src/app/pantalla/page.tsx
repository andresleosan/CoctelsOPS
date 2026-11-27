import type { Metadata } from "next";

import { BarDisplayBoard } from "@/components/orders/BarDisplayBoard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pantalla de Turnos en Barra | Coctels OPS",
  description:
    "Tablero en vivo de pedidos en preparación y listos para recoger en barra.",
};

export default async function PantallaTurnosPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string; negocioId?: string }>;
}) {
  const resolvedParams = await searchParams;
  const initialSlug = typeof resolvedParams.slug === "string" ? resolvedParams.slug : "";
  const initialNegocioId =
    typeof resolvedParams.negocioId === "string" ? resolvedParams.negocioId : "";

  return (
    <BarDisplayBoard
      initialSlug={initialSlug}
      initialNegocioId={initialNegocioId}
    />
  );
}
