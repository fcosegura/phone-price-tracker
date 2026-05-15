const DEFAULT_COUNTRY = 'es';
const PLATFORM_ID = 18;
const CACHE_TTL_MS = 60 * 60 * 1000;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** @type {{ config: object, expires: number } | null} */
let cache = null;

function getWssOrigin(country = DEFAULT_COUNTRY) {
  return `https://wss2.cex.${country}.webuy.io/v3`;
}

function pickSearchConfig(preLoginSettings) {
  if (!preLoginSettings?.algoliaSearchEnabled) {
    throw new Error('CeX no tiene búsqueda Algolia habilitada para esta región.');
  }
  const appId = preLoginSettings.algoliaAppId;
  const apiKey = preLoginSettings.algoliaSearchAppKey;
  const indexName = preLoginSettings.algoliaIndexName;
  if (!appId || !apiKey || !indexName) {
    throw new Error('Configuración Algolia de CeX incompleta.');
  }
  return {
    appId,
    apiKey,
    indexName,
    proxyUrl: 'https://search.webuy.io',
    useProxy: Boolean(Number(preLoginSettings.isAlgoliaProxyEnabled ?? 1)),
  };
}

export async function getCexSearchConfig(country = DEFAULT_COUNTRY) {
  if (cache && cache.expires > Date.now() && cache.country === country) {
    return cache.config;
  }

  const url = new URL(`${getWssOrigin(country)}/appsettings/prelogin`);
  url.searchParams.set('platformId', String(PLATFORM_ID));

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
    throw new Error(`CeX appsettings respondió ${response.status}`);
  }

  const payload = await response.json();
  if (payload?.response?.ack !== 'Success') {
    const message =
      payload?.response?.error?.internal_message ?? 'No se pudo cargar la configuración de CeX.';
    throw new Error(message);
  }

  const preLoginSettings = payload?.response?.data?.preLoginSettings ?? payload?.response?.data;
  const config = pickSearchConfig(preLoginSettings);
  cache = { config, country, expires: Date.now() + CACHE_TTL_MS };
  return config;
}
