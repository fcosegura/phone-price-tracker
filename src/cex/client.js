import { mapBoxDetail, mapBoxesResponse, mapStoresFromDetail } from './mappers.js';

const DEFAULT_COUNTRY = 'es';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

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
  const payload = await cexFetch(
    '/boxes',
    {
      q: query,
      firstRecord,
      countRecord,
      sortBy: 'relevance',
    },
    country,
  );
  return mapBoxesResponse(payload);
}

export async function getBoxDetail(boxId, country) {
  const attempts = [
    () => cexFetch('/boxes/detail', { boxId, id: boxId }, country),
    () => cexFetch(`/boxes/${boxId}`, {}, country),
    () => cexFetch('/product/detail', { boxId }, country),
  ];

  let lastError;
  for (const attempt of attempts) {
    try {
      const payload = await attempt();
      return mapBoxDetail(payload);
    } catch (error) {
      lastError = error;
    }
  }

  const searchResults = await searchBoxes(boxId, { countRecord: 5, country });
  const match = searchResults.find((item) => item.boxId === String(boxId));
  if (match) {
    return { ...match, stores: [] };
  }

  throw lastError ?? new Error(`No se encontró el producto ${boxId}`);
}

export async function getBoxWithAvailability(boxId, country) {
  const detail = await getBoxDetail(boxId, country);

  const availabilityAttempts = [
    () => cexFetch('/productAvailability', { boxId, boxIds: boxId }, country),
    () => cexFetch('/boxes/availability', { boxId }, country),
  ];

  for (const attempt of availabilityAttempts) {
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
