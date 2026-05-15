import { normalizeCcImageUrl } from './mappers.js';

const ALLOWED_HOSTS = new Set(['images.cashconverters.es', 'www.cashconverters.es']);

const IMAGE_HEADERS = {
  accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  referer: 'https://www.cashconverters.es/',
  origin: 'https://www.cashconverters.es',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

export function isAllowedCcImageUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export async function handleCcImageRequest(requestUrl) {
  const normalized = normalizeCcImageUrl(requestUrl.searchParams.get('url') ?? '');
  if (!normalized || !isAllowedCcImageUrl(normalized)) {
    return new Response('Forbidden', { status: 403 });
  }

  const upstream = await fetch(normalized, {
    headers: IMAGE_HEADERS,
    cf: { cacheTtl: 86_400 },
  });

  if (!upstream.ok) {
    return new Response('Not found', { status: upstream.status === 403 ? 403 : 404 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'image/jpeg',
      'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}
