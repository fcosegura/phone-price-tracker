import { getBoxWithAvailability, searchBoxes } from './cex/client.js';
import { fetchNewArrivalsMalagaCached, normalizeNewArrivalDays } from './cex/newArrivals.js';
import { handleCexImageRequest } from './cex/imageProxy.js';
import {
  createWatch,
  deleteWatch,
  getWatchHistory,
  listWatches,
  pollAllActiveWatches,
  refreshWatch,
  updateWatchFavorite,
} from './api/watches.js';
import { getPlannerData, savePlannerData } from './api/planner.js';
import { createSyncToken, linkScopeByCode, revokeSyncTokens } from './api/scope.js';
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

function buildScopeCookie(scopeId, request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SCOPE_COOKIE}=${encodeURIComponent(scopeId)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

function withScopeCookie(response, scopeId, request) {
  const headers = new Headers(response.headers);
  const cookie = request.headers.get('cookie') ?? '';
  if (!cookie.includes(`${SCOPE_COOKIE}=`)) {
    headers.append('set-cookie', buildScopeCookie(scopeId, request));
  }
  return new Response(response.body, { status: response.status, headers });
}

function setScopeCookie(response, scopeId, request) {
  const headers = new Headers(response.headers);
  headers.set('set-cookie', buildScopeCookie(scopeId, request));
  return new Response(response.body, { status: response.status, headers });
}

function getMaxWatches(env) {
  const parsed = Number.parseInt(env.MAX_WATCHES_PER_SCOPE ?? '20', 10);
  return Number.isFinite(parsed) ? parsed : 20;
}

async function readJsonBody(request, maxBytes = MAX_REQUEST_BYTES) {
  const text = await request.text();
  if (text.length > maxBytes) {
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
    const limit = Number.parseInt(url.searchParams.get('limit') ?? '250', 10);
    const sort = url.searchParams.get('sort') ?? 'relevance';
    const inStockOnly = ['1', 'true', 'yes'].includes(
      (url.searchParams.get('inStockOnly') ?? '').toLowerCase(),
    );
    const search = await searchBoxes(query, {
      countRecord: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 250,
      country,
      sortBy: ['price-asc', 'price-desc', 'relevance'].includes(sort) ? sort : 'relevance',
      inStockOnly,
      includeMeta: true,
    });
    return jsonResponse({ query, ...search });
  }

  if (url.pathname === '/api/cex/new-arrivals' && request.method === 'GET') {
    const days = normalizeNewArrivalDays(url.searchParams.get('days') ?? '3');
    const arrivals = await fetchNewArrivalsMalagaCached({
      days,
      country,
      cache: caches.default,
    });
    return jsonResponse(arrivals, 200, {
      'cache-control': arrivals.meta?.cached ? 'public, max-age=600' : 'public, max-age=60',
    });
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

  if (url.pathname === '/api/scope/share' && request.method === 'POST') {
    const token = await createSyncToken(env, scopeId);
    return jsonResponse(token);
  }

  if (url.pathname === '/api/scope/share' && request.method === 'DELETE') {
    await revokeSyncTokens(env, scopeId);
    return jsonResponse({ revoked: true });
  }

  if (url.pathname === '/api/planner' && request.method === 'GET') {
    const planner = await getPlannerData(env, scopeId);
    return jsonResponse(planner);
  }

  if (url.pathname === '/api/planner' && request.method === 'PUT') {
    const body = await readJsonBody(request, 64_000);
    try {
      const planner = await savePlannerData(env, scopeId, body);
      return jsonResponse(planner);
    } catch (error) {
      return jsonResponse({ error: error.message }, error.status ?? 500);
    }
  }

  if (url.pathname === '/api/scope/link' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const code = body.code ?? body.syncCode ?? '';
    const linkedScopeId = await linkScopeByCode(env, code);
    if (!linkedScopeId) {
      return jsonResponse({ error: 'Código inválido o expirado.' }, 404);
    }
    return {
      response: jsonResponse({ linked: true }),
      scopeId: linkedScopeId,
      forceCookie: true,
    };
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

  const watchMatch = url.pathname.match(/^\/api\/watches\/([^/]+)(?:\/(history|refresh|favorite))?$/);
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

    if (action === 'favorite' && request.method === 'PATCH') {
      const body = await readJsonBody(request);
      if (typeof body.isFavorite !== 'boolean') {
        return jsonResponse({ error: 'isFavorite debe ser booleano.' }, 400);
      }
      const watch = await updateWatchFavorite(env, scopeId, deviceId, body.isFavorite);
      if (!watch) {
        return jsonResponse({ error: 'Seguimiento no encontrado.' }, 404);
      }
      return jsonResponse({ watch });
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
        const apiResult = await handleApiRequest(request, env, url, scopeId);
        const forceCookie = Boolean(apiResult?.forceCookie);
        const apiResponse = forceCookie ? apiResult.response : apiResult;
        const cookieScopeId = forceCookie ? apiResult.scopeId : scopeId;
        const scopedResponse = forceCookie
          ? setScopeCookie(apiResponse, cookieScopeId, request)
          : withScopeCookie(apiResponse, cookieScopeId, request);
        return applySecurityHeaders(scopedResponse);
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
