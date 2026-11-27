import "server-only";

import type { Product } from "@/types/catalog";
import type { StoreConfiguration } from "@/types/operations";
import type { Promotion } from "@/types/promotions";
import type { NegocioConfiguration } from "@/types/tenant";

export const MAX_MESSAGE_CHARS = 1000;
export const MAX_HISTORY_TURNS = 8;
export const MAX_TOKENS = 512;
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";
export const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

export type OpsyFlavorProfile = "all" | "citrico" | "dulce" | "tropical" | "frutal";

export type OpsyUserPreferences = {
  alcoholFree?: boolean;
  flavorProfile?: OpsyFlavorProfile;
  happyHourOnly?: boolean;
};

export type OpsyActivePromoSummary = {
  id: string;
  code: string;
  title: string;
  description: string;
  discountLabel: string;
  discountType: Promotion["discountType"];
  discountValue: number;
  is2x1: boolean;
  endsAtTime?: string;
  productIds: string[];
  categoryIds: string[];
};

export type OpsyTenantContext = {
  id?: string;
  slug?: string;
  name?: string;
};

export type OpsyChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type OpsySuggestionSize = {
  label: string;
  priceCop: number;
};

export type OpsySuggestion = {
  id: string;
  name: string;
  category: string;
  priceCop: number;
  defaultSize?: string;
  sizes?: OpsySuggestionSize[];
  image?: string;
  href: string;
  stock?: number;
  alcoholFree?: boolean;
  promoBadge?: string;
  recommendedQuantity?: number;
  promoCode?: string;
};

export type OpsyChatReply = {
  reply: string;
  suggestions: OpsySuggestion[];
  activePromotions?: OpsyActivePromoSummary[];
  tenant?: OpsyTenantContext;
};

export type OpsyStoreConfig =
  | StoreConfiguration
  | NegocioConfiguration
  | Pick<StoreConfiguration, "deliveryZones" | "estimatedDeliveryMinutes" | "whatsappNumber">;

export type ProcessOpsyChatOptions = {
  message: string;
  history?: OpsyChatMessage[];
  products: Product[];
  config?: OpsyStoreConfig | null;
  activePromotions?: Promotion[];
  todayScheduledPromotions?: Promotion[];
  preferences?: OpsyUserPreferences;
  tenant?: OpsyTenantContext;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
};

const EXPLICIT_ALCOHOL_FREE_PATTERN = /\b(sin\s+(licor|alcohol)|0%\s*alcohol|cero\s+alcohol|virgen|mocktail)\b/i;
const LIQUOR_KEYWORD_PATTERN = /\b(ron|vodka|tequila|gin|ginebra|whisky|whiskey|aguardiente|mezcal|licor|cerveza|smirnoff|j[aä]ger|four\s*loko|coronita|prosecco|champagne|amaretto)\b/i;

const FLAVOR_PATTERNS: Record<Exclude<OpsyFlavorProfile, "all">, RegExp> = {
  citrico: /c[ií]tric|lim[oó]n|maracuy[aá]|lulo|naranja|toronja|mango\s*biche|[aá]cid/i,
  dulce: /dulce|fresa|lecherita|condensada|cremos|gomitas|cereza|coco|miel|vainilla|chocolate|caramelo|malteada/i,
  tropical: /tropical|coco|pi[nñ]a|mango|maracuy[aá]|sand[ií]a|guan[aá]bana|lychee|lulo/i,
  frutal: /fresa|mora|frutos\s*rojos|mango|maracuy[aá]|lulo|sand[ií]a|pi[nñ]a|cereza|uva|fruta|manzana/i,
};

export function isAlcoholFreeProduct(product: Product): boolean {
  const searchable = [
    product.name,
    product.description,
    ...(product.availableFlavors ?? []),
  ]
    .filter(Boolean)
    .join(" ");

  if (EXPLICIT_ALCOHOL_FREE_PATTERN.test(searchable)) {
    return true;
  }

  if (LIQUOR_KEYWORD_PATTERN.test(`${product.name} ${product.description}`)) {
    return false;
  }

  return product.category !== "cocktail";
}

export function matchesFlavorProfile(product: Product, profile: OpsyFlavorProfile): boolean {
  if (profile === "all") return true;
  const pattern = FLAVOR_PATTERNS[profile];
  const searchable = [
    product.name,
    product.description,
    ...(product.availableFlavors ?? []),
    ...(product.availableAddOns?.map((addOn) => addOn.name) ?? []),
  ]
    .filter(Boolean)
    .join(" ");
  return pattern.test(searchable);
}

export function formatPromoBadge(promo: Promotion): string {
  if (promo.discountType === "2x1") {
    return "2x1 Happy Hour";
  }
  if (promo.discountType === "percent") {
    return `-${promo.discountValue}% Happy Hour`;
  }
  return `-$${promo.discountValue.toLocaleString("es-CO")} COP`;
}

export function summarizeActivePromotion(promo: Promotion): OpsyActivePromoSummary {
  const discountLabel =
    promo.discountType === "2x1"
      ? "2x1 en Barra"
      : promo.discountType === "percent"
        ? `${promo.discountValue}% OFF`
        : `$${promo.discountValue.toLocaleString("es-CO")} COP OFF`;

  return {
    id: promo.id,
    code: promo.code,
    title:
      promo.title?.trim() ||
      (promo.discountType === "2x1" ? "¡Happy Hour 2x1!" : `¡Happy Hour ${discountLabel}!`),
    description: promo.description?.trim() || "",
    discountLabel,
    discountType: promo.discountType,
    discountValue: promo.discountValue,
    is2x1: promo.discountType === "2x1",
    ...(promo.schedule?.endTime ? { endsAtTime: promo.schedule.endTime } : {}),
    productIds: promo.productIds ?? [],
    categoryIds: promo.categoryIds ?? [],
  };
}

export function findMatchingPromotionsForProduct(
  product: Product,
  promos: Promotion[] = []
): Promotion[] {
  return promos
    .filter((promo) => {
      if (!promo.active) return false;
      const matchesProduct =
        !promo.productIds?.length || promo.productIds.includes(product.id);
      const matchesCategory =
        !promo.categoryIds?.length || promo.categoryIds.includes(product.category);
      return matchesProduct && matchesCategory;
    })
    .sort((left, right) => {
      if (left.discountType === "2x1" && right.discountType !== "2x1") return -1;
      if (left.discountType !== "2x1" && right.discountType === "2x1") return 1;
      return right.discountValue - left.discountValue;
    });
}

export function filterEligibleProducts(
  products: Product[],
  options: {
    preferences?: OpsyUserPreferences;
    activePromotions?: Promotion[];
  } = {}
): Product[] {
  const inStock = products.filter((p) => p.active !== false && p.stock > 0);
  const { preferences, activePromotions = [] } = options;

  let filtered = preferences?.alcoholFree
    ? inStock.filter((p) => isAlcoholFreeProduct(p))
    : inStock;

  if (preferences?.happyHourOnly && activePromotions.length > 0) {
    const promoMatches = filtered.filter(
      (p) => findMatchingPromotionsForProduct(p, activePromotions).length > 0
    );
    if (promoMatches.length > 0) {
      filtered = promoMatches;
    }
  }

  if (preferences?.flavorProfile && preferences.flavorProfile !== "all") {
    const flavorMatches = filtered.filter((p) =>
      matchesFlavorProfile(p, preferences.flavorProfile!)
    );
    if (flavorMatches.length > 0) {
      filtered = flavorMatches;
    }
  }

  return filtered;
}

function toOpsySuggestion(
  product: Product,
  options: { activePromotions?: Promotion[]; tenantSlug?: string } = {}
): OpsySuggestion {
  const sizes = Array.isArray(product.availableSizes)
    ? product.availableSizes
        .filter(
          (size) =>
            typeof size?.name === "string" &&
            size.name.trim().length > 0 &&
            typeof size?.price === "number" &&
            Number.isFinite(size.price) &&
            size.price >= 0
        )
        .map((size) => ({
          label: size.name.trim(),
          priceCop: size.price,
        }))
    : [];

  const matchingDefaultSize =
    sizes.find((size) => size.priceCop === product.price) ?? sizes[0];

  const matchingPromo = findMatchingPromotionsForProduct(
    product,
    options.activePromotions
  )[0];

  const basePath = options.tenantSlug
    ? `/m/${encodeURIComponent(options.tenantSlug)}`
    : "/menu";

  return {
    id: product.id,
    name: product.name,
    category: product.category,
    priceCop: product.price,
    defaultSize: matchingDefaultSize?.label ?? "Estándar",
    ...(sizes.length > 0 ? { sizes } : {}),
    image: product.image,
    href: `${basePath}?product=${encodeURIComponent(product.id)}`,
    stock: product.stock,
    alcoholFree: isAlcoholFreeProduct(product),
    ...(matchingPromo
      ? {
          promoBadge: formatPromoBadge(matchingPromo),
          promoCode: matchingPromo.code,
          recommendedQuantity: matchingPromo.discountType === "2x1" ? 2 : 1,
        }
      : {}),
  };
}

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /olvida\s+(todas\s+las\s+|las\s+)?instrucciones(\s+anteriores)?/i,
  /act\s+as\s+(an?\s+)?unrestricted/i,
  /system\s*prompt/i,
  /you\s+are\s+now\s+in\s+dan\s+mode/i,
  /prompt\s+del\s+sistema/i,
  /revela\s+(tu\s+|el\s+)?prompt/i,
];

const SENSITIVE_DATA_PATTERNS = [
  // Tarjetas de crédito (13 a 19 dígitos continuos o separados por guion/espacio)
  /\b(?:\d[ -]*?){13,19}\b/g,
  // Correos electrónicos
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
];

/**
 * Sanitiza el mensaje del usuario:
 * - Limita la longitud a MAX_MESSAGE_CHARS puntos de código Unicode.
 * - Oculta datos sensibles (tarjetas, emails).
 * - Detecta y neutraliza intentos de prompt injection.
 */
export function sanitizeUserMessage(input: string): {
  sanitized: string;
  hasInjectionAttempt: boolean;
} {
  const trimmed = Array.from(input.trim()).slice(0, MAX_MESSAGE_CHARS).join("");

  let hasInjectionAttempt = false;
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      hasInjectionAttempt = true;
      break;
    }
  }

  let cleaned = trimmed;
  for (const pattern of SENSITIVE_DATA_PATTERNS) {
    cleaned = cleaned.replace(pattern, "[DATO_PROTEGIDO]");
  }

  if (hasInjectionAttempt) {
    cleaned = "¡Hola Opsy! ¿Qué bebidas ricas me recomiendas de la carta?";
  }

  return {
    sanitized: cleaned,
    hasInjectionAttempt,
  };
}

/**
 * Construye el resumen público del catálogo, stock, promociones vigentes y preferencias para Opsy.
 */
export function buildCatalogContext(
  products: Product[],
  config?: OpsyStoreConfig | null,
  options: {
    activePromotions?: Promotion[];
    todayScheduledPromotions?: Promotion[];
    preferences?: OpsyUserPreferences;
    tenant?: OpsyTenantContext;
  } = {}
): string {
  const {
    activePromotions = [],
    todayScheduledPromotions = [],
    preferences,
    tenant,
  } = options;

  const activeProducts = filterEligibleProducts(products, {
    preferences: preferences?.alcoholFree ? { alcoholFree: true } : undefined,
    activePromotions,
  });

  const productList = activeProducts.map((p) => {
    const sizes = p.availableSizes?.length
      ? p.availableSizes.map((s) => `${s.name}: $${s.price.toLocaleString("es-CO")} COP`).join(", ")
      : `$${p.price.toLocaleString("es-CO")} COP`;

    const flavors = p.availableFlavors?.length ? p.availableFlavors.join(", ") : "Tradicional";
    const addOns = p.availableAddOns?.length
      ? p.availableAddOns.map((a) => `${a.name} (+$${a.price.toLocaleString("es-CO")})`).join(", ")
      : "Ninguna";
    const alcoholTag = isAlcoholFreeProduct(p) ? "Sin licor" : "Con licor";
    const matchingPromos = findMatchingPromotionsForProduct(p, activePromotions);
    const promoTag = matchingPromos.length
      ? ` | Promo activa: ${matchingPromos.map(formatPromoBadge).join(", ")}`
      : "";

    return `[ID: ${p.id}] Nombre: "${p.name}" | Categoría: ${p.category} | Tipo: ${alcoholTag} | Stock: ${p.stock} uds | Precio: ${sizes} | Sabores: ${flavors} | Adiciones: ${addOns}${promoTag} | Descripción: ${p.description || "Delicioso y refrescante"}`;
  });

  const configText = config
    ? `Cobertura de domicilios: ${config.deliveryZones.join(", ")}. Tiempo estimado: ${config.estimatedDeliveryMinutes} min. WhatsApp oficial: +${config.whatsappNumber}.`
    : `Cobertura principal: Villa Hermosa y Medellín. Tiempo estimado de entrega: 30-45 min.`;

  const promoLines = activePromotions.map((promo) => {
    const summary = summarizeActivePromotion(promo);
    const scope = promo.productIds?.length
      ? `Productos IDs: ${promo.productIds.join(", ")}`
      : promo.categoryIds?.length
        ? `Categorías: ${promo.categoryIds.join(", ")}`
        : "Toda la carta elegible";
    const timeWindow = summary.endsAtTime ? ` (vigente hasta las ${summary.endsAtTime})` : "";
    return `• ${summary.title} [${summary.discountLabel}] — Código: ${summary.code}${timeWindow} | Alcance: ${scope}`;
  });

  const scheduledLines = todayScheduledPromotions
    .filter((sched) => !activePromotions.some((active) => active.id === sched.id))
    .map((sched) => {
      const windowText = sched.schedule
        ? `${sched.schedule.startTime} - ${sched.schedule.endTime}`
        : "Hoy";
      return `• Próximo hoy: ${sched.title || sched.code} (${windowText})`;
    });

  const sections: string[] = [];

  if (tenant?.name) {
    sections.push(`### LOCAL ACTIVO:\nSede: ${tenant.name}${tenant.slug ? ` (/m/${tenant.slug})` : ""}`);
  }

  if (preferences?.alcoholFree || (preferences?.flavorProfile && preferences.flavorProfile !== "all") || preferences?.happyHourOnly) {
    const activeFilters: string[] = [];
    if (preferences.alcoholFree) {
      activeFilters.push("FILTRO ESTRICTO ACTIVO: SOLO BEBIDAS SIN LICOR (no recomiendes cócteles con alcohol)");
    }
    if (preferences.flavorProfile && preferences.flavorProfile !== "all") {
      activeFilters.push(`PREFERENCIA DE SABOR: ${preferences.flavorProfile}`);
    }
    if (preferences.happyHourOnly) {
      activeFilters.push("ENFOQUE: PRIORIZAR COMBOS Y HAPPY HOUR VIGENTE");
    }
    sections.push(`### PREFERENCIAS DEL CLIENTE:\n${activeFilters.join("\n")}`);
  }

  if (promoLines.length > 0 || scheduledLines.length > 0) {
    sections.push(
      `### HAPPY HOUR Y PROMOCIONES VIGENTES:\n${[...promoLines, ...scheduledLines].join("\n")}`
    );
  }

  sections.push(
    `### PRODUCTOS DISPONIBLES EN LA CARTA EN ESTE MOMENTO:\n${productList.length > 0 ? productList.join("\n") : "No hay productos disponibles con el filtro actual."}`
  );
  sections.push(`### INFORMACIÓN DE DOMICILIOS:\n${configText}`);

  return sections.join("\n\n");
}

/**
 * Construye el prompt de sistema para Opsy Bot con personalidad paisa y guardrails de seguridad.
 */
export function buildOpsySystemPrompt(catalogContext: string): string {
  return `Eres "Opsy el Panda", la mascota y bartender estrella oficial de "Coctels OPS" en Medellín, Colombia.
Tu personalidad es alegre, cercana, servicial y auténtica de Medellín (hablas como un parce paisa buena onda: "¡Qué más parce!", "¡De una!", "¡Qué chimba!", "ave maría", "con mucho gusto te colaboro").

REGLAS DE ORO DE SEGURIDAD Y GROUNDING (CUMPLIMIENTO ESTRICTO):
1. GROUNDING TOTAL: SOLO puedes sugerir o hablar de productos que están en la lista de PRODUCTOS DISPONIBLES EN LA CARTA que tienes a continuación. JAMÁS inventes productos, recetas, promociones o precios que no aparezcan ahí.
2. PRECIOS Y STOCK REALES: Menciona siempre los precios exactos en pesos colombianos (COP) y nunca sugieras productos agotados. Si hay Happy Hour o combos vigentes, destácalos con su horario y beneficio real.
3. FILTRO SIN LICOR: Si el cliente pide opciones sin licor o tiene activo el filtro sin licor, recomienda ÚNICAMENTE productos marcados como "Sin licor".
4. SUGERENCIAS ESTRUCTURADAS: Si le sugieres bebidas al usuario, al final obligatorio de tu respuesta incluye la etiqueta:
   [SUGERENCIAS: id_producto_1, id_producto_2]
   usando únicamente los IDs exactos de los productos que recomendaste (máximo 3 productos).
5. SEGURIDAD FINANCIERA: NUNCA pidas números de tarjeta, transferencias ni claves. Recuerda al cliente que puede agregar los productos o combos directo al carrito en la tienda o pedir por el WhatsApp oficial.
6. CONCISIÓN: Mantén tus respuestas breves, frescas y al grano (máximo 2 a 3 párrafos cortos).

${catalogContext}`;
}

/**
 * Filtra y valida que las sugerencias devueltas correspondan efectivamente a productos activos reales.
 */
export function extractAndValidateSuggestions(
  replyText: string,
  products: Product[],
  options: {
    preferences?: OpsyUserPreferences;
    activePromotions?: Promotion[];
    tenantSlug?: string;
  } = {}
): { cleanReply: string; suggestions: OpsySuggestion[] } {
  const activeProducts = filterEligibleProducts(products, {
    preferences: options.preferences?.alcoholFree ? { alcoholFree: true } : undefined,
  });
  const productMap = new Map(activeProducts.map((p) => [p.id, p]));

  const suggestionTagMatch = replyText.match(/\[SUGERENCIAS:\s*([^\]]+)\]/i);
  const cleanReply = replyText.replace(/\[SUGERENCIAS:\s*[^\]]+\]/gi, "").trim();

  const suggestedIds = new Set<string>();

  if (suggestionTagMatch && suggestionTagMatch[1]) {
    const rawIds = suggestionTagMatch[1].split(",").map((s) => s.trim());
    for (const rawId of rawIds) {
      if (productMap.has(rawId)) {
        suggestedIds.add(rawId);
      }
    }
  }

  // Si no se incluyó la etiqueta o los IDs eran erróneos, buscar coincidencias directas de nombres en la respuesta
  if (suggestedIds.size === 0) {
    for (const p of activeProducts) {
      if (cleanReply.toLowerCase().includes(p.name.toLowerCase())) {
        suggestedIds.add(p.id);
        if (suggestedIds.size >= 3) break;
      }
    }
  }

  const suggestions: OpsySuggestion[] = Array.from(suggestedIds)
    .slice(0, 3)
    .map((id) =>
      toOpsySuggestion(productMap.get(id)!, {
        activePromotions: options.activePromotions,
        tenantSlug: options.tenantSlug,
      })
    );

  return {
    cleanReply,
    suggestions,
  };
}

/**
 * Generador local de respuestas de Opsy Bot cuando DeepSeek no está configurado o falla la red.
 * Garantiza resiliencia 100% y cero caídas de servicio.
 */
export function getOpsyFallbackResponse(options: {
  message: string;
  products: Product[];
  config?: OpsyStoreConfig | null;
  activePromotions?: Promotion[];
  todayScheduledPromotions?: Promotion[];
  preferences?: OpsyUserPreferences;
  tenant?: OpsyTenantContext;
}): OpsyChatReply {
  const {
    message,
    products,
    config,
    activePromotions = [],
    todayScheduledPromotions = [],
    preferences,
    tenant,
  } = options;

  const lower = message.toLowerCase();
  const wantsAlcoholFree =
    Boolean(preferences?.alcoholFree) ||
    /\b(sin\s+alcohol|sin\s+licor|niñ[oa]s?|familiar|cero\s+alcohol|0%\s*alcohol)\b/i.test(lower);
  const wantsHappyHour =
    Boolean(preferences?.happyHourOnly) ||
    /\b(happy\s*hour|2x1|combo|promo(ci[oó]n|ciones)?|descuento|oferta)\b/i.test(lower);
  const flavorProfile =
    preferences?.flavorProfile && preferences.flavorProfile !== "all"
      ? preferences.flavorProfile
      : undefined;

  const activePromoSummaries = activePromotions.map(summarizeActivePromotion);
  const baseEligible = filterEligibleProducts(products, {
    preferences: {
      alcoholFree: wantsAlcoholFree,
      flavorProfile,
      happyHourOnly: wantsHappyHour,
    },
    activePromotions,
  });

  const suggestionOpts = {
    activePromotions,
    tenantSlug: tenant?.slug,
  };

  const withMeta = (reply: string, chosen: Product[]): OpsyChatReply => ({
    reply,
    suggestions: chosen.map((item) => toOpsySuggestion(item, suggestionOpts)),
    ...(activePromoSummaries.length > 0 ? { activePromotions: activePromoSummaries } : {}),
    ...(tenant ? { tenant } : {}),
  });

  if (baseEligible.length === 0 && wantsAlcoholFree) {
    return withMeta(
      "¡Parce, qué pena contigo! En este momento no tenemos bebidas sin licor disponibles con stock en este local.",
      []
    );
  }

  // Caso 1: Happy Hour en vivo, 2x1 o combos promocionales
  if (wantsHappyHour) {
    if (activePromotions.length > 0) {
      const primaryPromo = activePromotions[0]!;
      const summary = summarizeActivePromotion(primaryPromo);
      const promoProducts = baseEligible
        .filter((p) => findMatchingPromotionsForProduct(p, activePromotions).length > 0)
        .slice(0, 3);
      const chosen = (promoProducts.length > 0 ? promoProducts : baseEligible).slice(0, 3);
      const names = chosen
        .map((c) => `"${c.name}" ($${c.price.toLocaleString("es-CO")} COP)`)
        .join(", ");
      const untilText = summary.endsAtTime ? ` hasta las ${summary.endsAtTime}` : "";
      const comboHint = summary.is2x1
        ? " Agrega el combo 2x1 directo al carrito con 1 toque."
        : " Puedes sumarlos directo al carrito con 1 toque.";

      return withMeta(
        `¡Parce, tenemos activo ${summary.title} (${summary.discountLabel}${untilText})!${wantsAlcoholFree ? " Estas opciones son 100% sin licor:" : " Aprovecha"} ${names}.${comboHint}`,
        chosen
      );
    }

    const scheduled = todayScheduledPromotions.find((promo) => Boolean(promo.schedule));
    const chosen = baseEligible.slice(0, 2);
    if (scheduled?.schedule) {
      return withMeta(
        `¡Ojo al dato, parce! Hoy tenemos Happy Hour programado de ${scheduled.schedule.startTime} a ${scheduled.schedule.endTime} (${scheduled.title || scheduled.code}). Mientras arranca, te recomiendo ${chosen.map((c) => `"${c.name}"`).join(" y ")}.`,
        chosen
      );
    }

    return withMeta(
      `¡Parce, en este momento no hay un Happy Hour activo en la barra! Pero te recomiendo ${chosen.map((c) => `"${c.name}" ($${c.price.toLocaleString("es-CO")} COP)`).join(" y ")} disponibles ahora mismo.`,
      chosen
    );
  }

  // Caso 2: Preguntas sobre cítricos / ácidos / frutas
  if (
    flavorProfile === "citrico" ||
    lower.includes("citric") ||
    lower.includes("cítric") ||
    lower.includes("acido") ||
    lower.includes("ácido") ||
    lower.includes("limon") ||
    lower.includes("limón") ||
    lower.includes("maracuya") ||
    lower.includes("maracuyá") ||
    lower.includes("mango")
  ) {
    const citrusProducts = baseEligible.filter((p) => matchesFlavorProfile(p, "citrico"));
    const chosen = (citrusProducts.length > 0 ? citrusProducts : baseEligible).slice(0, 2);

    const names = chosen.map((c) => `"${c.name}" ($${c.price.toLocaleString("es-CO")} COP)`).join(" y ");
    return withMeta(
      `¡Qué más parce! Si buscas un toque cítrico que te despierte y refresque con toda${wantsAlcoholFree ? " (sin licor)" : ""}, te tengo ${names || "nuestras mejores opciones"}. ¡Una chimba total para el calor!`,
      chosen
    );
  }

  // Caso 3: Sin alcohol / para niños / familiar
  if (wantsAlcoholFree) {
    const chosen = baseEligible.slice(0, 2);
    const names = chosen.map((c) => `"${c.name}" ($${c.price.toLocaleString("es-CO")} COP)`).join(" y ");

    return withMeta(
      `¡De una, mi so! Para disfrutar tranquilo y en familia sin licor, te recomiendo ${names}. ¡Sabor puro y frutas bien frías!`,
      chosen
    );
  }

  // Caso 4: Domicilios / cobertura / tiempo de entrega
  if (
    lower.includes("domicilio") ||
    lower.includes("entrega") ||
    lower.includes("envio") ||
    lower.includes("envío") ||
    lower.includes("cobertura") ||
    lower.includes("tiempo")
  ) {
    const zones = config?.deliveryZones?.join(", ") || "Villa Hermosa y sectores aledaños en Medellín";
    const minutes = config?.estimatedDeliveryMinutes || 35;
    const whatsapp = config?.whatsappNumber ? `+${config.whatsappNumber}` : "nuestro WhatsApp";

    const featured = baseEligible.filter((p) => p.featured).slice(0, 2);
    const chosen = (featured.length > 0 ? featured : baseEligible).slice(0, 2);

    return withMeta(
      `¡Claro que sí, parce! Hacemos domicilios volando a ${zones}. El tiempo estimado es de unos ${minutes} minutos. Puedes armar tu pedido aquí en la web o escribirnos al WhatsApp ${whatsapp}.`,
      chosen
    );
  }

  // Caso 5: Precios / cuánto cuesta
  if (
    lower.includes("precio") ||
    lower.includes("cuanto cuesta") ||
    lower.includes("cuánto cuesta") ||
    lower.includes("valor") ||
    lower.includes("carta")
  ) {
    const chosen = baseEligible.slice(0, 3);
    const priceList = chosen.map((c) => `• ${c.name}: desde $${c.price.toLocaleString("es-CO")} COP`).join("\n");

    return withMeta(
      `¡Ave maría, parce! Aquí tienes algunos de los precios de nuestra carta:\n${priceList}\n\nPuedes ver todos los tamaños y adiciones tocando en cada producto.`,
      chosen
    );
  }

  // Caso Default: Saludo o recomendación general (respetando flavorProfile y local)
  const featured = baseEligible.filter((p) => p.featured);
  const chosen = (featured.length > 0 ? featured : baseEligible).slice(0, 2);
  const names = chosen.map((c) => `"${c.name}"`).join(" o ");
  const storeName = tenant?.name || "Coctels OPS";

  return withMeta(
    `¡Qué más pues, parce! Soy Opsy, el panda bartender de ${storeName} 🐼✨. ¿Qué se te antoja hoy? Te sugiero probar ${names || "nuestras especialidades neón"}, ¡quedan una locura!`,
    chosen
  );
}

/**
 * Procesa una consulta de chat con Opsy Bot:
 * 1. Sanitiza el mensaje y previene inyecciones.
 * 2. Si hay clave DEEPSEEK_API_KEY, invoca a DeepSeek con AbortController (10s) y contexto público multi-tenant + promos.
 * 3. Valida y filtra el grounding contra los productos activos y el filtro sin licor.
 * 4. Si la API falla o no está configurada, utiliza el generador antioqueño local resiliente.
 */
export async function processOpsyChat(
  options: ProcessOpsyChatOptions
): Promise<OpsyChatReply> {
  const {
    message,
    history = [],
    products,
    config,
    activePromotions = [],
    todayScheduledPromotions = [],
    preferences,
    tenant,
    apiKey = process.env.DEEPSEEK_API_KEY,
    model = process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL,
    timeoutMs = 10_000,
  } = options;

  const { sanitized, hasInjectionAttempt } = sanitizeUserMessage(message);
  const activePromoSummaries = activePromotions.map(summarizeActivePromotion);

  if (hasInjectionAttempt) {
    const safeProducts = filterEligibleProducts(products, {
      preferences: preferences?.alcoholFree ? { alcoholFree: true } : undefined,
      activePromotions,
    }).slice(0, 2);

    return {
      reply: "¡Epa parce! Vamos con calma que acá estamos es para pasarla sabroso con un buen granizado o cóctel neón 🐼🍹. ¿Qué sabor te provoca hoy?",
      suggestions: safeProducts.map((product) =>
        toOpsySuggestion(product, {
          activePromotions,
          tenantSlug: tenant?.slug,
        })
      ),
      ...(activePromoSummaries.length > 0 ? { activePromotions: activePromoSummaries } : {}),
      ...(tenant ? { tenant } : {}),
    };
  }

  // Si no hay API key de DeepSeek configurada, usar el fallback inteligente local
  if (!apiKey || apiKey.trim() === "" || apiKey === "mock") {
    return getOpsyFallbackResponse({
      message: sanitized,
      products,
      config,
      activePromotions,
      todayScheduledPromotions,
      preferences,
      tenant,
    });
  }

  const catalogContext = buildCatalogContext(products, config, {
    activePromotions,
    todayScheduledPromotions,
    preferences,
    tenant,
  });
  const systemPrompt = buildOpsySystemPrompt(catalogContext);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const formattedHistory = history.slice(-MAX_HISTORY_TURNS).map((item) => ({
      role: item.role,
      content: Array.from(item.content).slice(0, MAX_MESSAGE_CHARS).join(""),
    }));

    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...formattedHistory,
          { role: "user", content: sanitized },
        ],
        max_tokens: MAX_TOKENS,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(`[Opsy Bot] DeepSeek API devolvió HTTP ${response.status}. Usando fallback antioqueño.`);
      return getOpsyFallbackResponse({
        message: sanitized,
        products,
        config,
        activePromotions,
        todayScheduledPromotions,
        preferences,
        tenant,
      });
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const rawReply = data.choices?.[0]?.message?.content?.trim();
    if (!rawReply) {
      return getOpsyFallbackResponse({
        message: sanitized,
        products,
        config,
        activePromotions,
        todayScheduledPromotions,
        preferences,
        tenant,
      });
    }

    const { cleanReply, suggestions } = extractAndValidateSuggestions(rawReply, products, {
      preferences,
      activePromotions,
      tenantSlug: tenant?.slug,
    });

    return {
      reply: cleanReply,
      suggestions,
      ...(activePromoSummaries.length > 0 ? { activePromotions: activePromoSummaries } : {}),
      ...(tenant ? { tenant } : {}),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("[Opsy Bot] Timeout en llamada a DeepSeek. Usando fallback antioqueño.");
    } else {
      console.warn("[Opsy Bot] Error en llamada a DeepSeek. Usando fallback antioqueño.", error);
    }
    return getOpsyFallbackResponse({
      message: sanitized,
      products,
      config,
      activePromotions,
      todayScheduledPromotions,
      preferences,
      tenant,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
