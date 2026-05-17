import { normalizeGift } from '../bdplanner/storage.js';

const MAX_GIFTS_JSON_BYTES = 48_000;

function parseGiftsJson(raw) {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeGift);
  } catch {
    return [];
  }
}

export async function getPlannerData(env, scopeId) {
  const row = await env.DB.prepare(
    'SELECT birth_date AS birthDate, gifts_json AS giftsJson FROM scope_planner_data WHERE scope_id = ?1',
  )
    .bind(scopeId)
    .first();

  if (!row) {
    return { birthDate: '', gifts: [] };
  }

  return {
    birthDate: row.birthDate ?? '',
    gifts: parseGiftsJson(row.giftsJson),
  };
}

export async function savePlannerData(env, scopeId, body) {
  const birthDate = typeof body.birthDate === 'string' ? body.birthDate : '';
  const gifts = Array.isArray(body.gifts) ? body.gifts.map(normalizeGift) : [];
  const giftsJson = JSON.stringify(gifts);

  if (giftsJson.length > MAX_GIFTS_JSON_BYTES) {
    throw Object.assign(new Error('La lista de deseos es demasiado grande.'), { status: 413 });
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO scope_planner_data (scope_id, birth_date, gifts_json, updated_at)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(scope_id) DO UPDATE SET
       birth_date = excluded.birth_date,
       gifts_json = excluded.gifts_json,
       updated_at = excluded.updated_at`,
  )
    .bind(scopeId, birthDate || null, giftsJson, now)
    .run();

  return getPlannerData(env, scopeId);
}
