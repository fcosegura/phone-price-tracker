const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function buildAlgoliaUrl(config) {
  const base = config.useProxy ? config.proxyUrl : `https://${config.appId}-dsn.algolia.net`;
  return `${base}/1/indexes/${encodeURIComponent(config.indexName)}/query`;
}

export async function searchAlgoliaBoxes(query, { hitsPerPage = 20, page = 0, config }) {
  const params = new URLSearchParams({
    query: String(query).trim(),
    hitsPerPage: String(hitsPerPage),
    page: String(page),
  });

  const url = buildAlgoliaUrl(config);
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
    'user-agent': USER_AGENT,
  };

  if (config.useProxy) {
    headers['x-algolia-application-id'] = config.appId;
    headers['x-algolia-api-key'] = config.apiKey;
  } else {
    headers['X-Algolia-Application-Id'] = config.appId;
    headers['X-Algolia-API-Key'] = config.apiKey;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ params: params.toString() }),
  });

  if (!response.ok) {
    throw new Error(`Búsqueda CeX (Algolia) respondió ${response.status}`);
  }

  const payload = await response.json();
  return Array.isArray(payload?.hits) ? payload.hits : [];
}
