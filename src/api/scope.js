const SYNC_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function normalizeSyncCode(code) {
  return String(code ?? '')
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, '');
}

export function formatSyncCode(normalized) {
  if (normalized.length !== 8) {
    return normalized;
  }
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

function generateSyncCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let normalized = '';
  for (const byte of bytes) {
    normalized += SYNC_ALPHABET[byte % SYNC_ALPHABET.length];
  }
  return formatSyncCode(normalized);
}

async function hashSyncToken(normalized) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function revokeActiveTokens(env, scopeId) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE scope_sync_tokens
     SET revoked_at = ?2
     WHERE scope_id = ?1 AND revoked_at IS NULL`,
  )
    .bind(scopeId, now)
    .run();
}

export async function createSyncToken(env, scopeId) {
  await revokeActiveTokens(env, scopeId);
  const normalized = generateSyncCode().replace(/-/g, '');
  const displayCode = formatSyncCode(normalized);
  const tokenHash = await hashSyncToken(normalized);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS).toISOString();

  await env.DB.prepare(
    `INSERT INTO scope_sync_tokens (id, scope_id, token_hash, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(crypto.randomUUID(), scopeId, tokenHash, now.toISOString(), expiresAt)
    .run();

  return { code: displayCode, expiresAt };
}

export async function linkScopeByCode(env, code) {
  const normalized = normalizeSyncCode(code);
  if (normalized.length !== 8) {
    return null;
  }

  const tokenHash = await hashSyncToken(normalized);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    `SELECT scope_id AS scopeId
     FROM scope_sync_tokens
     WHERE token_hash = ?1
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > ?2)
     LIMIT 1`,
  )
    .bind(tokenHash, now)
    .first();

  return row?.scopeId ?? null;
}

export async function revokeSyncTokens(env, scopeId) {
  await revokeActiveTokens(env, scopeId);
  return true;
}
