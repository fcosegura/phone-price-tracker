/** CeX España: recogida física relevante en Málaga; el resto se trata como compra online. */
const MALAGA_PATTERN = /m[aá]laga/i;
const ONLINE_STORE_IDS = new Set(['online', 'catalog', 'ecom']);

export function isMalagaStore(storeName) {
  return MALAGA_PATTERN.test(String(storeName ?? ''));
}

function isOnlineCatalogStore(store) {
  const id = String(store?.storeId ?? '').toLowerCase();
  const name = String(store?.storeName ?? '').toLowerCase();
  return ONLINE_STORE_IDS.has(id) || name.includes('online') || name === 'cex online';
}

function normalizeStoreEntry(store) {
  if (typeof store === 'string') {
    return {
      storeId: store,
      storeName: store,
      inStock: true,
      quantity: null,
      isMalaga: isMalagaStore(store),
    };
  }
  const storeName = store?.storeName ?? store?.name ?? '';
  return {
    storeId: String(store?.storeId ?? storeName),
    storeName,
    inStock: Boolean(store?.inStock),
    quantity: store?.quantity != null ? Number(store.quantity) : null,
    isMalaga: store?.isMalaga ?? isMalagaStore(storeName),
  };
}

export function storesFromAlgoliaHit(hit) {
  const names = [
    ...(Array.isArray(hit?.collectionStores) ? hit.collectionStores : []),
    ...(Array.isArray(hit?.stores) ? hit.stores : []),
  ];
  const unique = [...new Set(names.map((n) => String(n).trim()).filter(Boolean))];
  return unique.map((name) => normalizeStoreEntry({ storeName: name, inStock: true }));
}

/**
 * @param {Array<{storeId?: string, storeName?: string, inStock?: boolean, quantity?: number|null}>} stores
 * @param {{ onlineQuantity?: number, inStockOnline?: number|boolean, ecomQuantity?: number, ecomQuantityOnHand?: number }} [options]
 */
export function summarizeAvailability(stores = [], options = {}) {
  const ecomQty = Number(
    options.onlineQuantity ?? options.ecomQuantity ?? options.ecomQuantityOnHand ?? 0,
  );
  const inStockOnline = options.inStockOnline === 1 || options.inStockOnline === true;

  const normalized = stores.map(normalizeStoreEntry);
  const inStockStores = normalized.filter((s) => s.inStock && s.storeName && !isOnlineCatalogStore(s));

  const malagaStores = inStockStores
    .filter((s) => s.isMalaga)
    .map((s) => ({
      storeId: s.storeId,
      storeName: s.storeName,
      quantity: s.quantity,
    }));

  const hasNonMalagaPhysical = inStockStores.some((s) => !s.isMalaga);
  const catalogOnline = normalized.some((s) => s.inStock && isOnlineCatalogStore(s));
  const onlineAvailable =
    inStockOnline || ecomQty > 0 || hasNonMalagaPhysical || catalogOnline;

  return {
    malagaStores,
    hasMalagaPickup: malagaStores.length > 0,
    onlineAvailable,
    onlineQuantity: ecomQty > 0 ? ecomQty : null,
    physicalStoreCount: inStockStores.length,
    nonMalagaStoreCount: inStockStores.filter((s) => !s.isMalaga).length,
  };
}

export function attachAvailabilitySummary(product, stores, options = {}) {
  const availability = summarizeAvailability(stores, {
    ...options,
    ecomQuantity: options.ecomQuantity ?? product?.stockQuantity,
    inStockOnline: options.inStockOnline,
  });
  return { ...product, stores, availability };
}
