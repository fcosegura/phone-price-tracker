import { getBoxDetail, getBoxWithAvailability } from '../cex/client.js';
import { normalizeImageUrl } from '../cex/mappers.js';
import { summarizeAvailability } from '../cex/storeAvailability.js';

const MAX_HISTORY = 90;

function rowToWatch(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    scopeId: row.scope_id,
    searchQuery: row.search_query,
    cexBoxId: row.cex_box_id,
    title: row.title,
    imageUrl: normalizeImageUrl(row.image_url),
    grade: row.grade,
    storageGb: row.storage_gb,
    color: row.color,
    variantLabel: row.variant_label,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    latestPrice: row.latest_sell_price != null ? { sellPrice: row.latest_sell_price, recordedAt: row.latest_price_at } : null,
    priceChange:
      row.latest_sell_price != null && row.prev_sell_price != null
        ? {
            delta: row.latest_sell_price - row.prev_sell_price,
            percent:
              row.prev_sell_price !== 0
                ? ((row.latest_sell_price - row.prev_sell_price) / row.prev_sell_price) * 100
                : null,
          }
        : null,
  };
}

async function getLatestAvailabilityMap(env, deviceIds) {
  const map = new Map();
  if (deviceIds.length === 0) {
    return map;
  }

  const rows = await env.DB.prepare(
    `SELECT a.device_id, a.store_id, a.store_name, a.in_stock, a.quantity
     FROM availability_snapshots a
     INNER JOIN (
       SELECT device_id, MAX(recorded_at) AS recorded_at
       FROM availability_snapshots
       GROUP BY device_id
     ) latest ON a.device_id = latest.device_id AND a.recorded_at = latest.recorded_at
     WHERE a.in_stock = 1`,
  ).all();

  for (const row of rows.results ?? []) {
    if (!deviceIds.includes(row.device_id)) {
      continue;
    }
    const stores = map.get(row.device_id) ?? [];
    stores.push({
      storeId: row.store_id,
      storeName: row.store_name,
      inStock: true,
      quantity: row.quantity,
    });
    map.set(row.device_id, stores);
  }

  for (const id of deviceIds) {
    const stores = map.get(id) ?? [];
    map.set(id, summarizeAvailability(stores));
  }

  return map;
}

async function persistWatchImage(env, deviceId, imageUrl) {
  const normalized = normalizeImageUrl(imageUrl);
  if (!normalized) {
    return null;
  }
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE tracked_devices SET image_url = ?2, updated_at = ?3 WHERE id = ?1')
    .bind(deviceId, normalized, now)
    .run();
  return normalized;
}

async function backfillWatchImage(env, watch, country) {
  if (watch.imageUrl) {
    return watch;
  }
  try {
    const detail = await getBoxDetail(watch.cexBoxId, country);
    const imageUrl = await persistWatchImage(env, watch.id, detail.imageUrl);
    return imageUrl ? { ...watch, imageUrl } : watch;
  } catch {
    return watch;
  }
}

export async function listWatches(env, scopeId) {
  const country = env.CEX_COUNTRY ?? 'es';
  const result = await env.DB.prepare(
    `SELECT d.*,
      (SELECT sell_price FROM price_snapshots WHERE device_id = d.id ORDER BY recorded_at DESC LIMIT 1) AS latest_sell_price,
      (SELECT recorded_at FROM price_snapshots WHERE device_id = d.id ORDER BY recorded_at DESC LIMIT 1) AS latest_price_at,
      (SELECT sell_price FROM price_snapshots WHERE device_id = d.id ORDER BY recorded_at DESC LIMIT 1 OFFSET 1) AS prev_sell_price
    FROM tracked_devices d
    WHERE d.scope_id = ?1 AND d.is_active = 1
    ORDER BY d.updated_at DESC`,
  )
    .bind(scopeId)
    .all();

  const watches = (result.results ?? []).map(rowToWatch);
  const availabilityMap = await getLatestAvailabilityMap(
    env,
    watches.map((watch) => watch.id),
  );
  const withAvailability = watches.map((watch) => ({
    ...watch,
    availability: availabilityMap.get(watch.id) ?? null,
  }));

  const needsImage = withAvailability.filter((watch) => !watch.imageUrl);
  if (needsImage.length === 0) {
    return withAvailability;
  }

  const backfilled = await Promise.all(
    needsImage.map((watch) => backfillWatchImage(env, watch, country)),
  );
  const byId = new Map(backfilled.map((watch) => [watch.id, watch]));
  return withAvailability.map((watch) => byId.get(watch.id) ?? watch);
}

export async function getWatch(env, scopeId, deviceId) {
  const row = await env.DB.prepare(
    'SELECT * FROM tracked_devices WHERE id = ?1 AND scope_id = ?2 AND is_active = 1',
  )
    .bind(deviceId, scopeId)
    .first();
  return rowToWatch(row);
}

export async function countWatches(env, scopeId) {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS total FROM tracked_devices WHERE scope_id = ?1 AND is_active = 1',
  )
    .bind(scopeId)
    .first();
  return Number(row?.total ?? 0);
}

export async function createWatch(env, scopeId, body, maxWatches) {
  const total = await countWatches(env, scopeId);
  if (total >= maxWatches) {
    const error = new Error(`Máximo ${maxWatches} dispositivos en seguimiento.`);
    error.status = 400;
    throw error;
  }

  const boxId = String(body.cexBoxId ?? body.boxId ?? '').trim();
  if (!boxId) {
    const error = new Error('cexBoxId es obligatorio.');
    error.status = 400;
    throw error;
  }

  const existing = await env.DB.prepare(
    'SELECT id FROM tracked_devices WHERE scope_id = ?1 AND cex_box_id = ?2 AND is_active = 1',
  )
    .bind(scopeId, boxId)
    .first();

  if (existing) {
    const error = new Error('Este listado CeX ya está en seguimiento.');
    error.status = 409;
    throw error;
  }

  const live = await getBoxWithAvailability(boxId, env.CEX_COUNTRY);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO tracked_devices (
      id, scope_id, search_query, cex_box_id, title, image_url, grade,
      storage_gb, color, variant_label, is_active, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, ?11, ?11)`,
  )
    .bind(
      id,
      scopeId,
      String(body.searchQuery ?? '').trim() || live.title,
      boxId,
      body.title ?? live.title,
      normalizeImageUrl(body.imageUrl ?? live.imageUrl),
      body.grade ?? live.grade,
      body.storageGb ?? live.storageGb,
      body.color ?? live.color,
      body.variantLabel ?? live.variantLabel,
      now,
    )
    .run();

  await recordSnapshots(env, id, live);

  const watch = await getWatch(env, scopeId, id);
  return { ...watch, availability: live.availability ?? null };
}

export async function deleteWatch(env, scopeId, deviceId) {
  const result = await env.DB.prepare(
    'UPDATE tracked_devices SET is_active = 0, updated_at = ?3 WHERE id = ?1 AND scope_id = ?2',
  )
    .bind(deviceId, scopeId, new Date().toISOString())
    .run();

  return Number(result.meta?.changes ?? 0) > 0;
}

async function getLatestPriceSnapshot(env, deviceId) {
  return env.DB.prepare(
    'SELECT sell_price, cash_price FROM price_snapshots WHERE device_id = ?1 ORDER BY recorded_at DESC LIMIT 1',
  )
    .bind(deviceId)
    .first();
}

async function getLatestAvailabilityFingerprint(env, deviceId) {
  const rows = await env.DB.prepare(
    `SELECT store_id, store_name, in_stock, quantity FROM availability_snapshots
     WHERE device_id = ?1 AND recorded_at = (
       SELECT MAX(recorded_at) FROM availability_snapshots WHERE device_id = ?1
     )`,
  )
    .bind(deviceId)
    .all();

  const list = rows.results ?? [];
  return JSON.stringify(
    list
      .map((r) => [r.store_id, r.store_name, r.in_stock, r.quantity])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}

export async function recordSnapshots(env, deviceId, live, options = {}) {
  const { forcePriceSnapshot = false } = options;
  const now = new Date().toISOString();
  const latest = await getLatestPriceSnapshot(env, deviceId);
  const sellPrice = live.sellPrice ?? null;
  const cashPrice = live.cashPrice ?? null;

  const priceChanged =
    latest == null ||
    latest.sell_price !== sellPrice ||
    latest.cash_price !== cashPrice;

  if (priceChanged || forcePriceSnapshot) {
    await env.DB.prepare(
      `INSERT INTO price_snapshots (id, device_id, sell_price, cash_price, currency, recorded_at)
       VALUES (?1, ?2, ?3, ?4, 'EUR', ?5)`,
    )
      .bind(crypto.randomUUID(), deviceId, sellPrice, cashPrice, now)
      .run();
  }

  const stores = live.stores ?? [];
  if (stores.length > 0) {
    const fingerprint = JSON.stringify(
      stores
        .map((s) => [s.storeId, s.storeName, s.inStock ? 1 : 0, s.quantity])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
    const prevFingerprint = await getLatestAvailabilityFingerprint(env, deviceId);
    if (prevFingerprint !== fingerprint) {
      for (const store of stores) {
        await env.DB.prepare(
          `INSERT INTO availability_snapshots (
            id, device_id, store_id, store_name, in_stock, quantity, recorded_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
        )
          .bind(
            crypto.randomUUID(),
            deviceId,
            store.storeId,
            store.storeName,
            store.inStock ? 1 : 0,
            store.quantity,
            now,
          )
          .run();
      }
    }
  }

  await env.DB.prepare('UPDATE tracked_devices SET updated_at = ?2 WHERE id = ?1')
    .bind(deviceId, now)
    .run();

  return { priceChanged, storeCount: stores.length };
}

export async function refreshWatch(env, scopeId, deviceId, country) {
  const watch = await getWatch(env, scopeId, deviceId);
  if (!watch) {
    return null;
  }
  const live = await getBoxWithAvailability(watch.cexBoxId, country);
  await recordSnapshots(env, deviceId, live, { forcePriceSnapshot: true });
  await persistWatchImage(env, deviceId, live.imageUrl);
  const updated = await getWatch(env, scopeId, deviceId);
  return {
    watch: { ...updated, availability: live.availability ?? null },
    live,
  };
}

export async function getWatchHistory(env, scopeId, deviceId) {
  const watch = await getWatch(env, scopeId, deviceId);
  if (!watch) {
    return null;
  }

  const prices = await env.DB.prepare(
    `SELECT sell_price, cash_price, currency, recorded_at
     FROM price_snapshots WHERE device_id = ?1
     ORDER BY recorded_at DESC LIMIT ?2`,
  )
    .bind(deviceId, MAX_HISTORY)
    .all();

  const availability = await env.DB.prepare(
    `SELECT store_id, store_name, in_stock, quantity, recorded_at
     FROM availability_snapshots WHERE device_id = ?1
     ORDER BY recorded_at DESC LIMIT ?2`,
  )
    .bind(deviceId, MAX_HISTORY * 5)
    .all();

  const latestStores = await env.DB.prepare(
    `SELECT store_id, store_name, in_stock, quantity, recorded_at
     FROM availability_snapshots
     WHERE device_id = ?1 AND recorded_at = (
       SELECT MAX(recorded_at) FROM availability_snapshots WHERE device_id = ?1
     )`,
  )
    .bind(deviceId)
    .all();

  const storeRows = latestStores.results ?? [];
  const stores = storeRows.map((row) => ({
    storeId: row.store_id,
    storeName: row.store_name,
    inStock: Boolean(row.in_stock),
    quantity: row.quantity,
  }));

  return {
    watch,
    prices: (prices.results ?? []).reverse(),
    availability: availability.results ?? [],
    latestStores: storeRows,
    availabilitySummary: summarizeAvailability(stores.filter((s) => s.inStock)),
  };
}

export async function pollAllActiveWatches(env, country) {
  const devices = await env.DB.prepare(
    'SELECT id, cex_box_id FROM tracked_devices WHERE is_active = 1',
  ).all();

  const summary = { total: 0, updated: 0, errors: [] };
  for (const device of devices.results ?? []) {
    summary.total += 1;
    try {
      const live = await getBoxWithAvailability(device.cex_box_id, country);
      const result = await recordSnapshots(env, device.id, live);
      if (result.priceChanged || result.storeCount > 0) {
        summary.updated += 1;
      }
    } catch (error) {
      summary.errors.push({ deviceId: device.id, message: error.message });
    }
  }
  return summary;
}
