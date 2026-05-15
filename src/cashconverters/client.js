import { buildAlternateQueries } from './queryVariants.js';
import { dedupeProducts, mapDatalayerToProduct } from './mappers.js';
import { parseProductDatalayers, parseStoreModal, shopCodeFromPid } from './parse.js';
import { filterMalagaProducts } from './stores.js';

const SITE_ORIGIN = 'https://www.cashconverters.es';
const STORE_API = `${SITE_ORIGIN}/on/demandware.store/Sites-CashConvertersCI-Site/es_ES`;
export const MOBILE_CATEGORY_ID = '5181';
const FEW_RESULTS_THRESHOLD = 3;

const FETCH_HEADERS = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'es-ES,es;q=0.9',
  origin: SITE_ORIGIN,
  referer: `${SITE_ORIGIN}/`,
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'x-requested-with': 'XMLHttpRequest',
};

async function ccFetch(path, searchParams = {}) {
  const url = new URL(path.startsWith('http') ? path : `${STORE_API}${path}`);
  for (const [key, value] of Object.entries(searchParams)) {
    if (value != null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), { headers: FETCH_HEADERS });
  if (!response.ok) {
    throw new Error(`Cash Converters respondió ${response.status} para ${url.pathname}`);
  }
  return response.text();
}

async function searchViaShow(query, { limit, start, categoryId }) {
  const params = {
    q: query.trim(),
    start: Math.max(0, start),
    sz: Math.min(limit, 50),
  };
  if (categoryId) {
    params.cgid = categoryId;
  }
  const html = await ccFetch('/Search-Show', params);
  return parseProductDatalayers(html)
    .map((layer) => mapDatalayerToProduct(layer))
    .filter(Boolean);
}

async function searchViaSuggestions(query) {
  const html = await ccFetch('/SearchServices-GetSuggestions', { q: query.trim() });
  return parseProductDatalayers(html)
    .map((layer) => mapDatalayerToProduct(layer))
    .filter(Boolean);
}

async function fetchStoreName(pid, storeCache) {
  const shopCode = shopCodeFromPid(pid);
  if (!shopCode) {
    return null;
  }
  if (storeCache.has(shopCode)) {
    return storeCache.get(shopCode);
  }
  try {
    const html = await ccFetch('/StoreSelector-StoreAvaibilityModal', {
      shopCode,
      pid,
    });
    const name = parseStoreModal(html);
    storeCache.set(shopCode, name);
    return name;
  } catch {
    storeCache.set(shopCode, null);
    return null;
  }
}

async function enrichWithStoreNames(products, storeCache) {
  const byShop = new Map();
  for (const product of products) {
    const shopCode = shopCodeFromPid(product.productId);
    if (!shopCode || byShop.has(shopCode)) {
      continue;
    }
    byShop.set(shopCode, product.productId);
  }

  await Promise.all(
    [...byShop.values()].map(async (pid) => {
      await fetchStoreName(pid, storeCache);
    }),
  );

  return products.map((product) => {
    const shopCode = shopCodeFromPid(product.productId);
    const storeName = shopCode ? storeCache.get(shopCode) : null;
    if (!storeName) {
      return product;
    }
    return {
      ...product,
      stores: [
        {
          storeId: shopCode,
          storeName,
          inStock: true,
          quantity: 1,
        },
      ],
      availability: {
        ...product.availability,
        storeName,
        inStock: true,
        isUniqueItem: true,
      },
    };
  });
}

async function searchPage(query, { limit, start, categoryId }) {
  let products = [];
  try {
    products = await searchViaShow(query, { limit, start, categoryId });
  } catch {
    products = [];
  }
  if (start === 0 && products.length < limit) {
    try {
      const extra = await searchViaSuggestions(query);
      products = dedupeProducts([...products, ...extra]);
    } catch {
      // keep Search-Show hits
    }
  }
  return dedupeProducts(products).sort((a, b) => (b.sellPrice ?? 0) - (a.sellPrice ?? 0));
}

/**
 * @returns {Promise<{
 *   results: import('./mappers.js').Product[],
 *   pagination: { start: number, limit: number, count: number, hasMore: boolean, nextStart: number|null },
 *   alternates: { query: string, results: import('./mappers.js').Product[] }[],
 *   categoryId: string|null
 * }>}
 */
export async function searchProducts(
  query,
  {
    limit = 24,
    start = 0,
    categoryId = MOBILE_CATEGORY_ID,
    mobileOnly = true,
    storeFilter = null,
    includeAlternates = true,
  } = {},
) {
  const capped = Math.max(1, Math.min(limit, 50));
  const offset = Math.max(0, start);
  const malagaFilter = storeFilter === 'malaga';
  const effectiveCategory = mobileOnly ? (categoryId ?? MOBILE_CATEGORY_ID) : null;
  const storeCache = new Map();

  async function loadPage(catId) {
    let batch = await searchPage(query, {
      limit: malagaFilter ? Math.min(capped * 4, 50) : capped,
      start: offset,
      categoryId: catId,
    });
    batch = await enrichWithStoreNames(batch, storeCache);
    if (malagaFilter) {
      batch = filterMalagaProducts(batch);
    }
    return batch;
  }

  let results = await loadPage(effectiveCategory);
  let searchedCategory = effectiveCategory;
  let expandedCatalog = false;

  if (malagaFilter && results.length === 0 && offset === 0 && effectiveCategory) {
    results = await loadPage(null);
    searchedCategory = null;
    expandedCatalog = true;
  }

  const hasMore = !malagaFilter && results.length >= capped;
  const pagination = {
    start: offset,
    limit: capped,
    count: results.length,
    hasMore,
    nextStart: hasMore ? offset + capped : null,
  };

  let alternates = [];
  const relatedQueriesTried = [];
  if (includeAlternates && offset === 0 && results.length < FEW_RESULTS_THRESHOLD && !malagaFilter) {
    const candidates = buildAlternateQueries(query);
    const exactIds = new Set(results.map((p) => p.productId));
    for (const altQuery of candidates) {
      let altResults = await searchPage(altQuery, {
        limit: capped,
        start: 0,
        categoryId: effectiveCategory,
      });
      if (altResults.length === 0) {
        continue;
      }
      relatedQueriesTried.push(altQuery);
      altResults = altResults.filter((p) => !exactIds.has(p.productId));
      if (altResults.length === 0) {
        continue;
      }
      altResults = await enrichWithStoreNames(altResults.slice(0, capped), storeCache);
      alternates.push({ query: altQuery, results: altResults });
      if (alternates.length >= 2) {
        break;
      }
    }
  }

  return {
    results: results.slice(0, capped),
    pagination,
    alternates,
    relatedQueriesTried,
    categoryId: searchedCategory,
    meta: {
      mobileOnly,
      storeFilter: malagaFilter ? 'malaga' : null,
      expandedCatalog,
      catalogNote: malagaFilter
        ? 'En la web de CC cada móvil es una unidad en una tienda concreta (Mauricio Moro CC018, Velázquez CC044). Si no hay resultados, no está publicado online en Málaga ahora.'
        : 'Cada resultado es un artículo único en la tienda indicada (catálogo nacional online).',
    },
  };
}

export async function getProduct(pid) {
  const id = String(pid ?? '').trim();
  if (!id) {
    throw new Error('productId requerido.');
  }

  const pdpUrl = `${SITE_ORIGIN}/ic/es_ES/segunda-mano/${encodeURIComponent(id)}.html`;
  const response = await fetch(pdpUrl, { headers: FETCH_HEADERS });
  if (!response.ok) {
    throw new Error(`Producto Cash Converters no encontrado (${response.status}).`);
  }

  const html = await response.text();
  const layers = parseProductDatalayers(html);
  const layer = layers.find((item) => String(item?.id) === id) ?? layers[0];
  if (!layer) {
    throw new Error('No se pudo leer el producto en Cash Converters.');
  }

  const storeCache = new Map();
  const [product] = await enrichWithStoreNames(
    [mapDatalayerToProduct(layer, { storeName: null })].filter(Boolean),
    storeCache,
  );
  if (!product) {
    throw new Error('No se pudo mapear el producto.');
  }
  const storeName = await fetchStoreName(id, storeCache);
  return mapDatalayerToProduct(layer, { storeName: storeName ?? product.availability?.storeName });
}

export async function getProductWithAvailability(pid) {
  const product = await getProduct(pid);
  if (!product) {
    throw new Error('Producto no disponible.');
  }
  return product;
}
