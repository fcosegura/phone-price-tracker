import { queryAlgoliaIndex } from './algolia.js';
import {
  mapAlgoliaHit,
  mapBoxDetail,
  mapStoresFromDetail,
} from './mappers.js';
import { getCexSearchConfig } from './settings.js';
import { attachAvailabilitySummary, storesFromAlgoliaHit } from './storeAvailability.js';

const DEFAULT_COUNTRY = 'es';
const MAX_ALGOLIA_HITS_PER_PAGE = 100;
const DEFAULT_SEARCH_LIMIT = 250;
const MAX_SEARCH_LIMIT = 500;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function compareSearchResultsByStock(a, b) {
  return (
    Number(b.availability?.hasMalagaPickup) - Number(a.availability?.hasMalagaPickup) ||
    Number(b.inStock) - Number(a.inStock) ||
    (b.sellPrice ?? 0) - (a.sellPrice ?? 0)
  );
}

function compareSearchResultsByPrice(direction) {
  return (a, b) => {
    const aPrice = a.sellPrice ?? (direction === 'asc' ? Number.POSITIVE_INFINITY : 0);
    const bPrice = b.sellPrice ?? (direction === 'asc' ? Number.POSITIVE_INFINITY : 0);
    return direction === 'asc' ? aPrice - bPrice : bPrice - aPrice;
  };
}

function getSearchIndexName(baseIndexName, sortBy) {
  if (sortBy === 'price-asc') {
    return `${baseIndexName}_price_asc`;
  }
  if (sortBy === 'price-desc') {
    return `${baseIndexName}_price_desc`;
  }
  return baseIndexName;
}

function getComparator(sortBy) {
  if (sortBy === 'price-asc') {
    return compareSearchResultsByPrice('asc');
  }
  if (sortBy === 'price-desc') {
    return compareSearchResultsByPrice('desc');
  }
  return compareSearchResultsByStock;
}

function normalizeSearchLimit(countRecord) {
  const parsed = Number.parseInt(countRecord ?? DEFAULT_SEARCH_LIMIT, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SEARCH_LIMIT;
  }
  return Math.min(Math.max(parsed, 1), MAX_SEARCH_LIMIT);
}

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

export async function searchBoxes(
  query,
  {
    firstRecord = 1,
    countRecord = DEFAULT_SEARCH_LIMIT,
    country,
    sortBy = 'relevance',
    inStockOnly = false,
    includeMeta = false,
  } = {},
) {
  const searchConfig = await getCexSearchConfig(country ?? DEFAULT_COUNTRY);
  const limit = normalizeSearchLimit(countRecord);
  const hitsPerPage = Math.min(limit, MAX_ALGOLIA_HITS_PER_PAGE);
  const firstPage = Math.max(0, Math.floor((firstRecord - 1) / hitsPerPage));
  const indexName = getSearchIndexName(searchConfig.indexName, sortBy);
  const facetFilters = inStockOnly ? 'availability:Disponible online' : null;
  const firstPayload = await queryAlgoliaIndex(query, {
    hitsPerPage,
    page: firstPage,
    config: searchConfig,
    indexName,
    facetFilters,
  });
  const nbHits = Number(firstPayload?.nbHits ?? 0);
  const nbPages = Number(firstPayload?.nbPages ?? 0);
  const pagesToFetch = Math.max(
    1,
    Math.min(Math.ceil(limit / hitsPerPage), Math.max(nbPages - firstPage, 0)),
  );
  const extraPayloads =
    pagesToFetch > 1
      ? await Promise.all(
        Array.from({ length: pagesToFetch - 1 }, (_, index) =>
          queryAlgoliaIndex(query, {
            hitsPerPage,
            page: firstPage + index + 1,
            config: searchConfig,
            indexName,
            facetFilters,
          }),
        ),
      )
      : [];
  const hits = [firstPayload, ...extraPayloads]
    .flatMap((payload) => (Array.isArray(payload?.hits) ? payload.hits : []))
    .slice(0, limit);
  const seenBoxIds = new Set();
  let results = hits
    .map((hit) => {
      const box = mapAlgoliaHit(hit);
      const stores = storesFromAlgoliaHit(hit);
      return attachAvailabilitySummary(box, stores, {
        ecomQuantity: hit.ecomQuantity,
        inStockOnline: hit.inStockOnline,
      });
    })
    .filter((box) => {
      if (!box.boxId || seenBoxIds.has(box.boxId)) {
        return false;
      }
      seenBoxIds.add(box.boxId);
      return true;
    })
    .sort(getComparator(sortBy));

  results = await enrichInStockWithStoreStock(results, country ?? DEFAULT_COUNTRY);
  results = results.sort(getComparator(sortBy));
  if (includeMeta) {
    return {
      results,
      total: nbHits,
      returned: results.length,
      truncated: nbHits > results.length,
      limit,
      sortBy,
      inStockOnly,
    };
  }
  return results;
}

export async function enrichBoxWithStoreStock(box, country = DEFAULT_COUNTRY) {
  if (!box?.boxId) {
    return box;
  }
  try {
    const payload = await cexFetch(`/boxes/${box.boxId}/stock`, {}, country);
    const stores = mapStoresFromDetail(payload).filter((s) => s.inStock);
    return attachAvailabilitySummary(box, stores, {
      ecomQuantity: box.stockQuantity,
      inStockOnline: box.inStock ? 1 : 0,
    });
  } catch {
    return box;
  }
}

async function enrichInStockWithStoreStock(results, country) {
  const toEnrich = results.filter((box) => box.inStock).slice(0, 12);
  if (toEnrich.length === 0) {
    return results;
  }

  const enriched = await Promise.all(toEnrich.map((box) => enrichBoxWithStoreStock(box, country)));

  const byId = new Map(enriched.map((box) => [box.boxId, box]));
  return results.map((box) => byId.get(box.boxId) ?? box);
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
    return match;
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
        return attachAvailabilitySummary(detail, stores, {
          ecomQuantity: detail.stockQuantity,
          inStockOnline: detail.inStock ? 1 : 0,
        });
      }
    } catch {
      // try next endpoint
    }
  }

  if (detail.inStock || detail.stockQuantity != null) {
    return attachAvailabilitySummary(
      detail,
      [
        {
          storeId: 'online',
          storeName: 'CeX online',
          inStock: detail.inStock ?? Number(detail.stockQuantity) > 0,
          quantity: detail.stockQuantity ?? null,
        },
      ],
      { ecomQuantity: detail.stockQuantity, inStockOnline: 1 },
    );
  }

  return attachAvailabilitySummary(detail, [], {
    ecomQuantity: detail.stockQuantity,
    inStockOnline: 0,
  });
}
