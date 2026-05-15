/** Tiendas Cash Converters en Málaga (código en prefijo del pid: CC018_…, CC044_…). */
export const MALAGA_SHOP_CODES = new Set(['CC018', 'CC044']);

const MALAGA_PATTERN = /m[aá]laga/i;

export function shopCodeFromProductId(productId) {
  return String(productId ?? '').split('_')[0] ?? '';
}

export function isMalagaProduct(product) {
  const shopCode = shopCodeFromProductId(product?.productId ?? product?.boxId);
  if (MALAGA_SHOP_CODES.has(shopCode)) {
    return true;
  }
  const storeName = product?.availability?.storeName ?? '';
  return MALAGA_PATTERN.test(storeName);
}

export function filterMalagaProducts(products) {
  return products.filter(isMalagaProduct);
}
