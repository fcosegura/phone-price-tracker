export const TABLE_BOOTSTRAP_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS tracked_devices (
    id TEXT PRIMARY KEY,
    scope_id TEXT NOT NULL,
    search_query TEXT NOT NULL,
    cex_box_id TEXT NOT NULL,
    title TEXT NOT NULL,
    image_url TEXT,
    grade TEXT,
    storage_gb INTEGER,
    color TEXT,
    variant_label TEXT,
    retailer TEXT NOT NULL DEFAULT 'cex',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(scope_id, cex_box_id)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_tracked_devices_scope ON tracked_devices(scope_id, is_active)',
  `CREATE TABLE IF NOT EXISTS price_snapshots (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    sell_price REAL,
    cash_price REAL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    recorded_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_price_snapshots_device_time ON price_snapshots(device_id, recorded_at DESC)',
  `CREATE TABLE IF NOT EXISTS availability_snapshots (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    store_id TEXT,
    store_name TEXT,
    in_stock INTEGER NOT NULL DEFAULT 0,
    quantity INTEGER,
    recorded_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_availability_device_time ON availability_snapshots(device_id, recorded_at DESC)',
];

const MIGRATION_STATEMENTS = [
  "ALTER TABLE tracked_devices ADD COLUMN retailer TEXT NOT NULL DEFAULT 'cex'",
  'CREATE INDEX IF NOT EXISTS idx_tracked_devices_retailer ON tracked_devices(scope_id, retailer, is_active)',
];

let schemaReadyPromise;

async function runMigrations(env) {
  const columns = await env.DB.prepare('PRAGMA table_info(tracked_devices)').all();
  const names = new Set((columns.results ?? []).map((column) => column.name));
  if (!names.has('retailer')) {
    await env.DB.prepare(MIGRATION_STATEMENTS[0]).run();
  }
  await env.DB.prepare(MIGRATION_STATEMENTS[1]).run();
}

export function ensureSchema(env) {
  if (!env?.DB) {
    return Promise.resolve();
  }
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      for (const statement of TABLE_BOOTSTRAP_STATEMENTS) {
        await env.DB.prepare(statement).run();
      }
      await runMigrations(env);
    })();
  }
  return schemaReadyPromise;
}
