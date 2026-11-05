import "server-only";

import type { Product } from "@/types/catalog";
import type { StoreConfiguration } from "@/types/operations";

export const MAX_MESSAGE_CHARS = 1000;
export const MAX_HISTORY_TURNS = 8;
export const MAX_TOKENS = 512;
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";
export const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

export type OpsyChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type OpsySuggestion = {
  id: string;
  name: string;
  category: string;
  priceCop: number;
  image?: string;
  href: string;
};

export type OpsyChatReply = {
  reply: string;
  suggestions: OpsySuggestion[];
};

export type ProcessOpsyChatOptions = {
  message: string;
  history?: OpsyChatMessage[];
  products: Product[];
  config?: StoreConfiguration | null;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
};

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
 * Construye el resumen público del catálogo para alimentar el contexto de Opsy.
 */
export function buildCatalogContext(
  products: Product[],
  config?: StoreConfiguration | null
): string {
  const activeProducts = products.filter((p) => p.active !== false && p.stock > 0);

  const productList = activeProducts.map((p) => {
    const sizes = p.availableSizes?.length
      ? p.availableSizes.map((s) => `${s.name}: $${s.price.toLocaleString("es-CO")} COP`).join(", ")
      : `$${p.price.toLocaleString("es-CO")} COP`;

    const flavors = p.availableFlavors?.length ? p.availableFlavors.join(", ") : "Tradicional";
    const addOns = p.availableAddOns?.length
      ? p.availableAddOns.map((a) => `${a.name} (+$${a.price.toLocaleString("es-CO")})`).join(", ")
      : "Ninguna";

    return `[ID: ${p.id}] Nombre: "${p.name}" | Categoría: ${p.category} | Precio: ${sizes} | Sabores: ${flavors} | Adiciones: ${addOns} | Descripción: ${p.description || "Delicioso y refrescante"}`;
  });

  const configText = config
    ? `Cobertura de domicilios: ${config.deliveryZones.join(", ")}. Tiempo estimado: ${config.estimatedDeliveryMinutes} min. WhatsApp oficial: +${config.whatsappNumber}.`
    : `Cobertura principal: Villa Hermosa y Medellín. Tiempo estimado de entrega: 30-45 min.`;

  return `### PRODUCTOS DISPONIBLES EN LA CARTA EN ESTE MOMENTO:\n${productList.join("\n")}\n\n### INFORMACIÓN DE DOMICILIOS:\n${configText}`;
}

/**
 * Construye el prompt de sistema para Opsy Bot con personalidad paisa y guardrails de seguridad.
 */
export function buildOpsySystemPrompt(catalogContext: string): string {
  return `Eres "Opsy el Panda", la mascota y bartender estrella oficial de "Coctels OPS" en Medellín, Colombia.
Tu personalidad es alegre, cercana, servicial y auténtica de Medellín (hablas como un parce paisa buena onda: "¡Qué más parce!", "¡De una!", "¡Qué chimba!", "ave maría", "con mucho gusto te colaboro").

REGLAS DE ORO DE SEGURIDAD Y GROUNDING (CUMPLIMIENTO ESTRICTO):
1. GROUNDING TOTAL: SOLO puedes sugerir o hablar de productos que están en la lista de PRODUCTOS DISPONIBLES EN LA CARTA que tienes a continuación. JAMÁS inventes productos, recetas o precios que no aparezcan ahí.
2. PRECIOS REALES: Menciona siempre los precios exactos en pesos colombianos (COP) tal como están listados.
3. SUGERENCIAS ESTRUCTURADAS: Si le sugieres bebidas al usuario, al final obligatorio de tu respuesta incluye la etiqueta:
   [SUGERENCIAS: id_producto_1, id_producto_2]
   usando únicamente los IDs exactos de los productos que recomendaste (máximo 3 productos).
4. SEGURIDAD FINANCIERA: NUNCA pidas números de tarjeta, transferencias ni claves. Recuerda al cliente que puede agregar los productos directo al carrito en la tienda o pedir por el WhatsApp oficial.
5. CONCISIÓN: Mantén tus respuestas breves, frescas y al grano (máximo 2 a 3 párrafos cortos).

${catalogContext}`;
}

/**
 * Filtra y valida que las sugerencias devueltas correspondan efectivamente a productos activos reales.
 */
export function extractAndValidateSuggestions(
  replyText: string,
  products: Product[]
): { cleanReply: string; suggestions: OpsySuggestion[] } {
  const activeProducts = products.filter((p) => p.active !== false && p.stock > 0);
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

  // Armar la lista de sugerencias válidas
  const suggestions: OpsySuggestion[] = Array.from(suggestedIds)
    .slice(0, 3)
    .map((id) => {
      const p = productMap.get(id)!;
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        priceCop: p.price,
        image: p.image,
        href: `/menu?product=${encodeURIComponent(p.id)}`,
      };
    });

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
  config?: StoreConfiguration | null;
}): OpsyChatReply {
  const { message, products, config } = options;
  const activeProducts = products.filter((p) => p.active !== false && p.stock > 0);
  const lower = message.toLowerCase();

  // Caso 1: Preguntas sobre cítricos / ácidos / frutas
  if (
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
    const citrusProducts = activeProducts.filter(
      (p) =>
        p.availableFlavors?.some((f) => /maracuy|lim[oó]n|mango/i.test(f)) ||
        /maracuy|lim[oó]n|mango|c[ií]tric/i.test(p.name) ||
        /maracuy|lim[oó]n|mango|c[ií]tric/i.test(p.description)
    );
    const chosen = (citrusProducts.length > 0 ? citrusProducts : activeProducts).slice(0, 2);

    const names = chosen.map((c) => `"${c.name}" ($${c.price.toLocaleString("es-CO")} COP)`).join(" y ");
    return {
      reply: `¡Qué más parce! Si buscas un toque cítrico que te despierte y refresque con toda, te tengo ${names || "nuestros mejores granizados"}. ¡Una chimba total para el calor!`,
      suggestions: chosen.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        priceCop: p.price,
        image: p.image,
        href: `/menu?product=${encodeURIComponent(p.id)}`,
      })),
    };
  }

  // Caso 2: Sin alcohol / para niños / familiar
  if (
    lower.includes("sin alcohol") ||
    lower.includes("sin licor") ||
    lower.includes("niño") ||
    lower.includes("niña") ||
    lower.includes("familiar")
  ) {
    const nonAlcoholic = activeProducts.filter(
      (p) => p.category === "granizado" || !/ron|vodka|licor|tequila|gin/i.test(p.description)
    );
    const chosen = (nonAlcoholic.length > 0 ? nonAlcoholic : activeProducts).slice(0, 2);
    const names = chosen.map((c) => `"${c.name}" ($${c.price.toLocaleString("es-CO")} COP)`).join(" y ");

    return {
      reply: `¡De una, mi so! Para disfrutar tranquilo y en familia sin licor, te recomiendo ${names}. ¡Sabor puro y frutas bien frías!`,
      suggestions: chosen.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        priceCop: p.price,
        image: p.image,
        href: `/menu?product=${encodeURIComponent(p.id)}`,
      })),
    };
  }

  // Caso 3: Domicilios / cobertura / tiempo de entrega
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

    const featured = activeProducts.filter((p) => p.featured).slice(0, 2);
    const chosen = (featured.length > 0 ? featured : activeProducts).slice(0, 2);

    return {
      reply: `¡Claro que sí, parce! Hacemos domicilios volando a ${zones}. El tiempo estimado es de unos ${minutes} minutos. Puedes armar tu pedido aquí en la web o escribirnos al WhatsApp ${whatsapp}.`,
      suggestions: chosen.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        priceCop: p.price,
        image: p.image,
        href: `/menu?product=${encodeURIComponent(p.id)}`,
      })),
    };
  }

  // Caso 4: Precios / cuánto cuesta
  if (
    lower.includes("precio") ||
    lower.includes("cuanto cuesta") ||
    lower.includes("cuánto cuesta") ||
    lower.includes("valor") ||
    lower.includes("carta")
  ) {
    const chosen = activeProducts.slice(0, 3);
    const priceList = chosen.map((c) => `• ${c.name}: desde $${c.price.toLocaleString("es-CO")} COP`).join("\n");

    return {
      reply: `¡Ave maría, parce! Aquí tienes algunos de los precios de nuestra carta:\n${priceList}\n\nPuedes ver todos los tamaños y adiciones tocando en cada producto.`,
      suggestions: chosen.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        priceCop: p.price,
        image: p.image,
        href: `/menu?product=${encodeURIComponent(p.id)}`,
      })),
    };
  }

  // Caso Default: Saludo o recomendación general
  const featured = activeProducts.filter((p) => p.featured);
  const chosen = (featured.length > 0 ? featured : activeProducts).slice(0, 2);
  const names = chosen.map((c) => `"${c.name}"`).join(" o ");

  return {
    reply: `¡Qué más pues, parce! Soy Opsy, el panda bartender de Coctels OPS 🐼✨. ¿Qué se te antoja hoy? Te sugiero probar ${names || "nuestras especialidades neón"}, ¡quedan una locura!`,
    suggestions: chosen.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      priceCop: p.price,
      image: p.image,
      href: `/menu?product=${encodeURIComponent(p.id)}`,
    })),
  };
}

/**
 * Procesa una consulta de chat con Opsy Bot:
 * 1. Sanitiza el mensaje y previene inyecciones.
 * 2. Si hay clave DEEPSEEK_API_KEY, invoca a DeepSeek con AbortController (10s) y contexto público.
 * 3. Valida y filtra el grounding contra los productos activos.
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
    apiKey = process.env.DEEPSEEK_API_KEY,
    model = process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL,
    timeoutMs = 10_000,
  } = options;

  const { sanitized, hasInjectionAttempt } = sanitizeUserMessage(message);

  if (hasInjectionAttempt) {
    return {
      reply: "¡Epa parce! Vamos con calma que acá estamos es para pasarla sabroso con un buen granizado o cóctel neón 🐼🍹. ¿Qué sabor te provoca hoy?",
      suggestions: products
        .filter((p) => p.active !== false && p.stock > 0)
        .slice(0, 2)
        .map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          priceCop: p.price,
          image: p.image,
          href: `/menu?product=${encodeURIComponent(p.id)}`,
        })),
    };
  }

  // Si no hay API key de DeepSeek configurada, usar el fallback inteligente local
  if (!apiKey || apiKey.trim() === "" || apiKey === "mock") {
    return getOpsyFallbackResponse({ message: sanitized, products, config });
  }

  const catalogContext = buildCatalogContext(products, config);
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
      // Registrar de forma segura sin revelar API Key ni tokens
      console.warn(`[Opsy Bot] DeepSeek API devolvió HTTP ${response.status}. Usando fallback antioqueño.`);
      return getOpsyFallbackResponse({ message: sanitized, products, config });
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const rawReply = data.choices?.[0]?.message?.content?.trim();
    if (!rawReply) {
      return getOpsyFallbackResponse({ message: sanitized, products, config });
    }

    const { cleanReply, suggestions } = extractAndValidateSuggestions(rawReply, products);

    return {
      reply: cleanReply,
      suggestions,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("[Opsy Bot] Timeout en llamada a DeepSeek. Usando fallback antioqueño.");
    } else {
      console.warn("[Opsy Bot] Error en llamada a DeepSeek. Usando fallback antioqueño.", error);
    }
    return getOpsyFallbackResponse({ message: sanitized, products, config });
  } finally {
    clearTimeout(timeoutId);
  }
}

