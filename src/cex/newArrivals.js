import { queryAlgoliaIndex } from './algolia.js';
import { enrichBoxWithStoreStock } from './client.js';
import { mapAlgoliaHit } from './mappers.js';
import { getCexSearchConfig } from './settings.js';
import {
  attachAvailabilitySummary,
  isMalagaStore,
  storesFromAlgoliaHit,
} from './storeAvailability.js';

export const ALLOWED_NEW_ARRIVAL_DAYS = [1, 3, 5];

/** SKUs con menos de este antigüedad pueden contar como novedad en tienda vía timestamp. */
const MAX_SKU_AGE_MS = 120 * 24 * 60 * 60 * 1000;

/** Máximo de peticiones Algolia por invocación (límite Worker ~50 subrequests). */
const MAX_ALGOLIA_REQUESTS = 8;

/** Máximo de comprobaciones de stock CeX por invocación. */
const MAX_STOCK_REQUESTS = 10;

const DISCOVERY_QUERIES = [
  'iphone',
  'samsung',
  'galaxy',
  'xiaomi',
  'motorola',
  'honor',
  'oppo',
  'playstation',
];

const HITS_PER_PAGE = 80;
const MAX_RESULTS = 40;
const CACHE_TTL_SECONDS = 600;

export function parseCatalogDate(value) {
  if (value == null || value === '') {
    return null;
  }
  const normalized = String(value).trim().replace(' ', 'T');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

/** @deprecated use parseCatalogDate */
export const parseFirstStockInDate = parseCatalogDate;

export function normalizeNewArrivalDays(days) {
  const parsed = Number.parseInt(days ?? 3, 10);
  return ALLOWED_NEW_ARRIVAL_DAYS.includes(parsed) ? parsed : 3;
}

function hitHasMalagaStoreHint(hit) {
  const storeNames = [
    ...(Array.isArray(hit?.collectionStores) ? hit.collectionStores : []),
    ...(Array.isArray(hit?.stores) ? hit.stores : []),
  ];
  return storeNames.some((name) => isMalagaStore(name));
}

/**
 * @returns {{ kind: 'catalog' | 'malaga-stock', sortAt: number, displayDate: string|null, catalogDate?: string|null } | null}
 */
export function getNewArrivalMatch(hit, cutoffMs) {
  const firstStock = parseCatalogDate(hit.firstStockInDate ?? hit.firstStockDate);
  const updated = parseCatalogDate(hit.timestamp);
  if (!firstStock) {
    return null;
  }

  const firstStockMs = firstStock.getTime();
  if (firstStockMs >= cutoffMs) {
    return {
      kind: 'catalog',
      sortAt: firstStockMs,
      displayDate: hit.firstStockInDate ?? hit.firstStockDate ?? null,
    };
  }

  if (updated && updated.getTime() >= cutoffMs && Date.now() - firstStockMs <= MAX_SKU_AGE_MS) {
    return {
      kind: 'malaga-stock',
      sortAt: updated.getTime(),
      displayDate: hit.timestamp ?? null,
      catalogDate: hit.firstStockInDate ?? hit.firstStockDate ?? null,
    };
  }

  return null;
}

function mapHitToCandidate(hit) {
  const box = mapAlgoliaHit(hit);
  const stores = storesFromAlgoliaHit(hit);
  return attachAvailabilitySummary(box, stores, {
    ecomQuantity: hit.ecomQuantity,
    inStockOnline: hit.inStockOnline,
  });
}

function buildResultProduct(entry) {
  const product = mapHitToCandidate(entry.hit);
  return {
    ...product,
    firstStockInDate: entry.hit.firstStockInDate ?? entry.hit.firstStockDate ?? null,
    arrivalKind: entry.match.kind,
    arrivalDate: entry.match.displayDate,
    catalogListedAt: entry.match.catalogDate ?? entry.hit.firstStockInDate ?? null,
  };
}

async function discoverRecentHits(config, cutoffMs) {
  const seenBoxIds = new Set();
  const candidates = [];
  let algoliaRequests = 0;

  for (const query of DISCOVERY_QUERIES) {
    if (algoliaRequests >= MAX_ALGOLIA_REQUESTS) {
      break;
    }
    algoliaRequests += 1;
    const payload = await queryAlgoliaIndex(query, {
      hitsPerPage: HITS_PER_PAGE,
      page: 0,
      config,
    });

    for (const hit of payload?.hits ?? []) {
      const boxId = String(hit?.boxId ?? hit?.objectID ?? '').trim();
      if (!boxId || seenBoxIds.has(boxId)) {
        continue;
      }
      const match = getNewArrivalMatch(hit, cutoffMs);
      if (!match) {
        continue;
      }
      seenBoxIds.add(boxId);
      candidates.push({
        hit,
        match,
        malagaHint: hitHasMalagaStoreHint(hit),
      });
    }
  }

  return { candidates, scannedBoxIds: seenBoxIds.size, algoliaRequests };
}

async function enrichMalagaCandidates(candidates, country) {
  const hinted = candidates.filter((entry) => entry.malagaHint);
  const others = candidates.filter((entry) => !entry.malagaHint);

  const results = [];
  let withoutMalagaStock = 0;
  let stockRequests = 0;

  for (const entry of hinted) {
    if (results.length >= MAX_RESULTS) {
      break;
    }
    const product = buildResultProduct(entry);
    if (product.availability?.hasMalagaPickup) {
      results.push(product);
      continue;
    }
    if (stockRequests >= MAX_STOCK_REQUESTS) {
      withoutMalagaStock += 1;
      continue;
    }
    stockRequests += 1;
    const verified = await enrichBoxWithStoreStock(product, country);
    if (verified.availability?.hasMalagaPickup) {
      results.push({
        ...verified,
        firstStockInDate: product.firstStockInDate,
        arrivalKind: product.arrivalKind,
        arrivalDate: product.arrivalDate,
        catalogListedAt: product.catalogListedAt,
      });
    } else {
      withoutMalagaStock += 1;
    }
  }

  for (const entry of others) {
    if (results.length >= MAX_RESULTS || stockRequests >= MAX_STOCK_REQUESTS) {
      break;
    }
    let product = buildResultProduct(entry);
    if (!product.availability?.hasMalagaPickup) {
      stockRequests += 1;
      product = await enrichBoxWithStoreStock(product, country);
    }
    if (!product.availability?.hasMalagaPickup) {
      withoutMalagaStock += 1;
      continue;
    }
    results.push(product);
  }

  return {
    results: results.sort((a, b) => {
      const aTime =
        parseCatalogDate(a.arrivalDate)?.getTime() ??
        parseCatalogDate(a.firstStockInDate)?.getTime() ??
        0;
      const bTime =
        parseCatalogDate(b.arrivalDate)?.getTime() ??
        parseCatalogDate(b.firstStockInDate)?.getTime() ??
        0;
      return bTime - aTime;
    }),
    withoutMalagaStock,
    stockRequests,
  };
}

export async function fetchNewArrivalsMalaga({ days = 3, country = 'es' } = {}) {
  const rangeDays = normalizeNewArrivalDays(days);
  const cutoffMs = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
  const config = await getCexSearchConfig(country);
  const { candidates, scannedBoxIds, algoliaRequests } = await discoverRecentHits(config, cutoffMs);
  const { results, withoutMalagaStock, stockRequests } = await enrichMalagaCandidates(
    candidates,
    country,
  );

  return {
    days: rangeDays,
    results,
    returned: results.length,
    candidatesInRange: candidates.length,
    candidatesWithoutMalaga: withoutMalagaStock,
    scannedBoxIds,
    malagaOnly: true,
    meta: {
      algoliaRequests,
      stockRequests,
      cached: false,
    },
  };
}

export function newArrivalsCacheKey(days, country) {
  return `https://new-arrivals.cex-tracker.local/${country}/${normalizeNewArrivalDays(days)}`;
}

export async function fetchNewArrivalsMalagaCached({ days = 3, country = 'es', cache } = {}) {
  if (!cache) {
    return fetchNewArrivalsMalaga({ days, country });
  }

  const cacheKey = newArrivalsCacheKey(days, country);
  const cached = await cache.match(cacheKey);
  if (cached) {
    const payload = await cached.json();
    return {
      ...payload,
      meta: { ...(payload.meta ?? {}), cached: true },
    };
  }

  const fresh = await fetchNewArrivalsMalaga({ days, country });
  await cache.put(
    cacheKey,
    new Response(JSON.stringify(fresh), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
      },
    }),
  );
  return fresh;
}
