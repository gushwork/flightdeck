import { Pool } from 'pg';

let pool: Pool | null = null;
let tableEnsured = false;
let pgAvailable = true;

function databaseUrl(): string | null {
  const url = process.env.DATABASE_URL?.trim();
  return url ? url : null;
}

function createPool(): Pool {
  return new Pool({
    connectionString: databaseUrl()!,
    connectionTimeoutMillis: 3000,
    max: 5,
  });
}

/** Postgres-backed TTL cache is off when `DATABASE_URL` is unset or blank. */
export async function getPool(): Promise<Pool | null> {
  if (!databaseUrl()) return null;

  if (!pgAvailable) throw new Error('Postgres unavailable');

  if (!pool) {
    pool = createPool();
    pool.on('error', () => {
      pgAvailable = false;
    });
  }

  if (!tableEnsured) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS cache (
          key        TEXT PRIMARY KEY,
          data       JSONB NOT NULL,
          ttl_ms     INTEGER NOT NULL DEFAULT 60000,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '60 seconds')
        )
      `);
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache (expires_at)`,
      );
      tableEnsured = true;
    } catch {
      pgAvailable = false;
      throw new Error('Postgres unavailable');
    }
  }

  return pool;
}

export default { getPool };
