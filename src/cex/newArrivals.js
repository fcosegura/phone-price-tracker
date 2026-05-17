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

const DISCOVERY_QUERIES = [
  'iphone',
  'samsung',
  'xiaomi',
  'pixel',
  'motorola',
  'oppo',
  'honor',
  'huawei',
  'oneplus',
  'nokia',
  'galaxy',
  'playstation',
  'xbox',
  'nintendo',
  'switch',
  'ipad',
  'tablet',
  'macbook',
  'auricular',
  'fundas',
  'cable',
  'mando',
];

const PAGES_PER_QUERY = 2;
const HITS_PER_PAGE = 100;
const MAX_STOCK_CHECKS = 48;
const MAX_RESULTS = 50;
const STOCK_CHECK_CONCURRENCY = 10;

export function parseFirstStockInDate(value) {
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

function mapHitToCandidate(hit) {
  const box = mapAlgoliaHit(hit);
  const stores = storesFromAlgoliaHit(hit);
  return attachAvailabilitySummary(box, stores, {
    ecomQuantity: hit.ecomQuantity,
    inStockOnline: hit.inStockOnline,
  });
}

async function discoverRecentHits(config, cutoffMs) {
  const seenBoxIds = new Set();
  const candidates = [];

  for (let index = 0; index < DISCOVERY_QUERIES.length; index += 4) {
    const batch = DISCOVERY_QUERIES.slice(index, index + 4);
    const requests = batch.flatMap((query) =>
      Array.from({ length: PAGES_PER_QUERY }, (_, page) =>
        queryAlgoliaIndex(query, {
          hitsPerPage: HITS_PER_PAGE,
          page,
          config,
          filters: 'inStockStore=1',
        }),
      ),
    );
    const payloads = await Promise.all(requests);

    for (const payload of payloads) {
      for (const hit of payload?.hits ?? []) {
        const boxId = String(hit?.boxId ?? hit?.objectID ?? '').trim();
        if (!boxId || seenBoxIds.has(boxId)) {
          continue;
        }
        const firstStockAt = parseFirstStockInDate(hit.firstStockInDate ?? hit.firstStockDate);
        if (!firstStockAt || firstStockAt.getTime() < cutoffMs) {
          continue;
        }
        seenBoxIds.add(boxId);
        candidates.push({
          hit,
          firstStockAt,
          malagaHint: hitHasMalagaStoreHint(hit),
        });
      }
    }
  }

  return { candidates, scannedBoxIds: seenBoxIds.size };
}

async function enrichMalagaCandidates(candidates, country) {
  const ordered = [
    ...candidates.filter((entry) => entry.malagaHint),
    ...candidates.filter((entry) => !entry.malagaHint),
  ].slice(0, MAX_STOCK_CHECKS);

  const results = [];
  for (let index = 0; index < ordered.length; index += STOCK_CHECK_CONCURRENCY) {
    const chunk = ordered.slice(index, index + STOCK_CHECK_CONCURRENCY);
    const enriched = await Promise.all(
      chunk.map(async (entry) => {
        let product = mapHitToCandidate(entry.hit);
        if (!product.availability?.hasMalagaPickup) {
          product = await enrichBoxWithStoreStock(product, country);
        }
        if (!product.availability?.hasMalagaPickup) {
          return null;
        }
        return {
          ...product,
          firstStockInDate: entry.hit.firstStockInDate ?? entry.hit.firstStockDate ?? null,
        };
      }),
    );

    for (const product of enriched) {
      if (product && results.length < MAX_RESULTS) {
        results.push(product);
      }
    }
  }

  return results.sort((a, b) => {
    const aTime = parseFirstStockInDate(a.firstStockInDate)?.getTime() ?? 0;
    const bTime = parseFirstStockInDate(b.firstStockInDate)?.getTime() ?? 0;
    return bTime - aTime;
  });
}

export async function fetchNewArrivalsMalaga({ days = 3, country = 'es' } = {}) {
  const rangeDays = normalizeNewArrivalDays(days);
  const cutoffMs = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
  const config = await getCexSearchConfig(country);
  const { candidates, scannedBoxIds } = await discoverRecentHits(config, cutoffMs);
  const results = await enrichMalagaCandidates(candidates, country);

  return {
    days: rangeDays,
    results,
    returned: results.length,
    candidatesInRange: candidates.length,
    scannedBoxIds,
    malagaOnly: true,
  };
}
