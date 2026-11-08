import type { OrderItem } from '@/types/orders';
import type { CartItem } from '@/context/cart-context';

/**
 * Convierte una lista de OrderItem proveniente de un pedido existente
 * a una lista de ítems lista para ser incorporada al carrito de compras (CartContext),
 * preservando tamaño, sabores, adiciones y precios unitarios exactos en COP.
 */
export function orderItemsToCartItems(
  items: unknown,
  fallbackImage: string = '/catalog-placeholder.svg'
): Array<Omit<CartItem, 'id'>> {
  if (!Array.isArray(items)) return [];

  const result: Array<Omit<CartItem, 'id'>> = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Partial<OrderItem> & { price?: number; image?: string };

    if (typeof candidate.productId !== 'string' || candidate.productId.trim().length === 0) {
      continue;
    }
    if (typeof candidate.name !== 'string' || candidate.name.trim().length === 0) {
      continue;
    }

    const price = typeof candidate.unitPrice === 'number' && Number.isFinite(candidate.unitPrice)
      ? Math.max(0, candidate.unitPrice)
      : (typeof candidate.price === 'number' && Number.isFinite(candidate.price) ? Math.max(0, candidate.price) : 0);

    const quantity = typeof candidate.quantity === 'number' && Number.isFinite(candidate.quantity)
      ? Math.max(1, Math.floor(candidate.quantity))
      : 1;

    const rawCustomization = candidate.customization;
    const size = typeof rawCustomization?.size === 'string' && rawCustomization.size.trim().length > 0
      ? rawCustomization.size.trim()
      : 'Medium';

    const flavors = Array.isArray(rawCustomization?.flavors)
      ? rawCustomization.flavors.filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
      : [];

    const addOns = Array.isArray(rawCustomization?.addOns)
      ? rawCustomization.addOns.filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
      : [];

    const image = typeof candidate.image === 'string' && candidate.image.trim().length > 0
      ? candidate.image
      : fallbackImage;

    result.push({
      productId: candidate.productId.trim(),
      name: candidate.name.trim(),
      price,
      quantity,
      image,
      customization: {
        size,
        flavors,
        addOns,
      },
    });
  }

  return result;
}
