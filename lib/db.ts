import { Pool } from 'pg';

let pool: Pool | null = null;
let tableEnsured = false;
let pgAvailable = true;

function createPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 3000,
    max: 5,
  });
}

export async function getPool(): Promise<Pool> {
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
