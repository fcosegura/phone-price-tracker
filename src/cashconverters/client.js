import { dedupeProducts, mapDatalayerToProduct } from './mappers.js';
import { parseProductDatalayers, parseStoreModal, shopCodeFromPid } from './parse.js';

const SITE_ORIGIN = 'https://www.cashconverters.es';
const STORE_API = `${SITE_ORIGIN}/on/demandware.store/Sites-CashConvertersCI-Site/es_ES`;

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

export async function searchProducts(query, { limit = 24 } = {}) {
  const html = await ccFetch('/SearchServices-GetSuggestions', { q: query.trim() });
  const layers = parseProductDatalayers(html);
  const products = layers
    .map((layer) => mapDatalayerToProduct(layer))
    .filter(Boolean);
  const sorted = dedupeProducts(products).sort(
    (a, b) => (b.sellPrice ?? 0) - (a.sellPrice ?? 0),
  );
  return sorted.slice(0, Math.max(1, Math.min(limit, 50)));
}

async function fetchStoreName(pid) {
  const shopCode = shopCodeFromPid(pid);
  if (!shopCode) {
    return null;
  }
  try {
    const html = await ccFetch('/StoreSelector-StoreAvaibilityModal', {
      shopCode,
      pid,
    });
    return parseStoreModal(html);
  } catch {
    return null;
  }
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

  const storeName = await fetchStoreName(id);
  return mapDatalayerToProduct(layer, { storeName });
}

export async function getProductWithAvailability(pid) {
  const product = await getProduct(pid);
  if (!product) {
    throw new Error('Producto no disponible.');
  }
  return product;
}
