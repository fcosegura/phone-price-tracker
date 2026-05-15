import { getBoxWithAvailability, searchBoxes } from './cex/client.js';
import { handleCexImageRequest } from './cex/imageProxy.js';
import {
  createWatch,
  deleteWatch,
  getWatchHistory,
  listWatches,
  pollAllActiveWatches,
  refreshWatch,
} from './api/watches.js';
import { ensureSchema } from './db/schema.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const SECURITY_HEADERS = {
  'content-security-policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};

const SCOPE_COOKIE = 'cex_tracker_scope';
const MAX_REQUEST_BYTES = 8_000;

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function applySecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  if (response.url && new URL(response.url).pathname.startsWith('/assets/')) {
    headers.set('cache-control', 'public, max-age=31536000, immutable');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function getScopeId(request) {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`${SCOPE_COOKIE}=([^;]+)`));
  if (match?.[1]) {
    return decodeURIComponent(match[1]);
  }
  return crypto.randomUUID();
}

function withScopeCookie(response, scopeId, request) {
  const headers = new Headers(response.headers);
  const cookie = request.headers.get('cookie') ?? '';
  if (!cookie.includes(`${SCOPE_COOKIE}=`)) {
    const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
    headers.append(
      'set-cookie',
      `${SCOPE_COOKIE}=${encodeURIComponent(scopeId)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`,
    );
  }
  return new Response(response.body, { status: response.status, headers });
}

function getMaxWatches(env) {
  const parsed = Number.parseInt(env.MAX_WATCHES_PER_SCOPE ?? '20', 10);
  return Number.isFinite(parsed) ? parsed : 20;
}

async function readJsonBody(request) {
  const text = await request.text();
  if (text.length > MAX_REQUEST_BYTES) {
    throw Object.assign(new Error('Cuerpo de petición demasiado grande.'), { status: 413 });
  }
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error('JSON inválido.'), { status: 400 });
  }
}

async function handleApiRequest(request, env, url, scopeId) {
  const country = env.CEX_COUNTRY ?? 'es';

  if (url.pathname === '/api/health' && request.method === 'GET') {
    return jsonResponse({ ok: true, app: env.APP_NAME ?? 'phone-price-tracker' });
  }

  if (url.pathname === '/api/cex/search' && request.method === 'GET') {
    const query = (url.searchParams.get('q') ?? '').trim();
    if (query.length < 2) {
      return jsonResponse({ error: 'Introduce al menos 2 caracteres.' }, 400);
    }
    const limit = Number.parseInt(url.searchParams.get('limit') ?? '50', 10);
    const results = await searchBoxes(query, {
      countRecord: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 50) : 50,
      country,
    });
    return jsonResponse({ query, results });
  }

  if (url.pathname === '/api/cex/image' && request.method === 'GET') {
    return handleCexImageRequest(url);
  }

  if (url.pathname === '/api/cex/product' && request.method === 'GET') {
    const boxId = url.searchParams.get('boxId');
    if (!boxId) {
      return jsonResponse({ error: 'boxId requerido.' }, 400);
    }
    const product = await getBoxWithAvailability(boxId, country);
    return jsonResponse({ product });
  }

  if (url.pathname === '/api/watches' && request.method === 'GET') {
    const watches = await listWatches(env, scopeId);
    return jsonResponse({ watches });
  }

  if (url.pathname === '/api/watches' && request.method === 'POST') {
    const body = await readJsonBody(request);
    try {
      const watch = await createWatch(env, scopeId, body, getMaxWatches(env));
      return jsonResponse({ watch }, 201);
    } catch (error) {
      return jsonResponse({ error: error.message }, error.status ?? 500);
    }
  }

  const watchMatch = url.pathname.match(/^\/api\/watches\/([^/]+)(?:\/(history|refresh))?$/);
  if (watchMatch) {
    const deviceId = watchMatch[1];
    const action = watchMatch[2];

    if (action === 'history' && request.method === 'GET') {
      const history = await getWatchHistory(env, scopeId, deviceId);
      if (!history) {
        return jsonResponse({ error: 'Seguimiento no encontrado.' }, 404);
      }
      return jsonResponse(history);
    }

    if (action === 'refresh' && request.method === 'POST') {
      const result = await refreshWatch(env, scopeId, deviceId, country);
      if (!result) {
        return jsonResponse({ error: 'Seguimiento no encontrado.' }, 404);
      }
      return jsonResponse(result);
    }

    if (!action && request.method === 'DELETE') {
      const removed = await deleteWatch(env, scopeId, deviceId);
      if (!removed) {
        return jsonResponse({ error: 'Seguimiento no encontrado.' }, 404);
      }
      return jsonResponse({ ok: true });
    }
  }

  return jsonResponse({ error: 'Ruta no encontrada.' }, 404);
}

export default {
  async fetch(request, env) {
    try {
      await ensureSchema(env);
      const url = new URL(request.url);
      const scopeId = getScopeId(request);

      if (url.pathname.startsWith('/api/')) {
        const apiResponse = await handleApiRequest(request, env, url, scopeId);
        return applySecurityHeaders(withScopeCookie(apiResponse, scopeId, request));
      }

      const assetResponse = await env.ASSETS.fetch(request);
      return applySecurityHeaders(assetResponse);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'worker_error',
          message: error.message,
          stack: error.stack,
        }),
      );
      return applySecurityHeaders(
        jsonResponse({ error: error.message ?? 'Error interno.' }, error.status ?? 500),
      );
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        await ensureSchema(env);
        const summary = await pollAllActiveWatches(env, env.CEX_COUNTRY ?? 'es');
        console.log(JSON.stringify({ event: 'cron_poll', ...summary, scheduledTime: event.scheduledTime }));
      })(),
    );
  },
};
