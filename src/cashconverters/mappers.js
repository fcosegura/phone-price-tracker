import { parseSpanishPrice, shopCodeFromPid } from './parse.js';

export function normalizeCcImageUrl(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return null;
}

export function mapDatalayerToProduct(layer, { storeName = null } = {}) {
  const pid = String(layer?.id ?? '').trim();
  if (!pid) {
    return null;
  }

  const sellPrice = parseSpanishPrice(layer.price);
  const grade = layer.status ?? layer.variant ?? null;
  const inStock = sellPrice != null;

  const stores =
    storeName != null
      ? [
          {
            storeId: shopCodeFromPid(pid),
            storeName,
            inStock: true,
            quantity: 1,
          },
        ]
      : [];

  return {
    retailer: 'cc',
    productId: pid,
    boxId: pid,
    title: layer.name ?? pid,
    sellPrice,
    cashPrice: null,
    grade,
    variantLabel: grade ? `Estado: ${grade}` : 'Cash Converters',
    imageUrl: normalizeCcImageUrl(layer.imageUrl),
    inStock,
    stockStatus: inStock ? 'Disponible' : 'No disponible',
    stockQuantity: inStock ? 1 : 0,
    stores,
    availability: {
      storeName,
      inStock,
      isUniqueItem: true,
    },
    productUrl: layer.url && typeof layer.url === 'string' ? layer.url : null,
  };
}

export function dedupeProducts(products) {
  const seen = new Set();
  return products.filter((product) => {
    if (!product?.productId || seen.has(product.productId)) {
      return false;
    }
    seen.add(product.productId);
    return true;
  });
}
