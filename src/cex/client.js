import { searchAlgoliaBoxes } from './algolia.js';
import {
  mapAlgoliaHit,
  mapBoxDetail,
  mapStoresFromDetail,
} from './mappers.js';
import { getCexSearchConfig } from './settings.js';

const DEFAULT_COUNTRY = 'es';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export function getCexBaseUrl(country = DEFAULT_COUNTRY) {
  return `https://wss2.cex.${country}.webuy.io/v3`;
}

async function cexFetch(path, searchParams = {}, country = DEFAULT_COUNTRY) {
  const url = new URL(`${getCexBaseUrl(country)}${path}`);
  for (const [key, value] of Object.entries(searchParams)) {
    if (value != null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      accept: 'application/json, text/plain, */*',
      'accept-language': 'es-ES,es;q=0.9',
      origin: 'https://es.webuy.com',
      referer: 'https://es.webuy.com/',
      'user-agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    const blocked =
      response.status === 403 && (response.headers.get('server') ?? '').includes('cloudflare');
    if (blocked) {
      throw new Error(
        `CeX bloqueó la petición (${response.status} en ${path}). La búsqueda usa Algolia; el detalle usa /boxes/{id}/detail.`,
      );
    }
    throw new Error(`CeX API respondió ${response.status} para ${path}`);
  }

  const payload = await response.json();
  const ack = payload?.response?.ack ?? payload?.ack;
  if (ack && ack !== 'Success' && ack !== 'success') {
    const message =
      payload?.response?.error?.internal_message ??
      payload?.response?.error?.code ??
      'Respuesta CeX no exitosa';
    throw new Error(message);
  }

  return payload;
}

export async function searchBoxes(query, { firstRecord = 1, countRecord = 20, country } = {}) {
  const searchConfig = await getCexSearchConfig(country ?? DEFAULT_COUNTRY);
  const hitsPerPage = Math.max(1, Math.min(countRecord, 50));
  const page = Math.max(0, Math.floor((firstRecord - 1) / hitsPerPage));
  const hits = await searchAlgoliaBoxes(query, {
    hitsPerPage,
    page,
    config: searchConfig,
  });
  return hits.map(mapAlgoliaHit).filter((box) => box.boxId);
}

export async function getBoxDetail(boxId, country) {
  const id = String(boxId).trim();
  const attempts = [
    () => cexFetch(`/boxes/${id}/detail`, {}, country),
    () => cexFetch('/boxes/detail', { boxId: id, id }, country),
  ];

  let lastError;
  for (const attempt of attempts) {
    try {
      const payload = await attempt();
      const mapped = mapBoxDetail(payload);
      if (mapped.boxId) {
        return mapped;
      }
    } catch (error) {
      lastError = error;
    }
  }

  const searchResults = await searchBoxes(id, { countRecord: 5, country });
  const match = searchResults.find((item) => item.boxId.toUpperCase() === id.toUpperCase());
  if (match) {
    return { ...match, stores: [] };
  }

  throw lastError ?? new Error(`No se encontró el producto ${id}`);
}

export async function getBoxWithAvailability(boxId, country) {
  const detail = await getBoxDetail(boxId, country);
  const id = String(boxId).trim();

  const stockAttempts = [
    () => cexFetch(`/boxes/${id}/stock`, {}, country),
    () => cexFetch('/productAvailability', { boxId: id, boxIds: id }, country),
    () => cexFetch('/boxes/availability', { boxId: id }, country),
  ];

  for (const attempt of stockAttempts) {
    try {
      const payload = await attempt();
      const stores = mapStoresFromDetail(payload);
      if (stores.length > 0) {
        return { ...detail, stores };
      }
    } catch {
      // try next endpoint
    }
  }

  if (detail.stockQuantity != null || detail.stockStatus) {
    const inStock =
      detail.stockStatus?.toLowerCase?.().includes('stock') &&
      !detail.stockStatus?.toLowerCase?.().includes('out');
    return {
      ...detail,
      stores: [
        {
          storeId: 'catalog',
          storeName: 'Catálogo CeX',
          inStock: inStock ?? Number(detail.stockQuantity) > 0,
          quantity: detail.stockQuantity ?? null,
        },
      ],
    };
  }

  return detail;
}
