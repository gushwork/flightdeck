import { getPool } from './db';

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const pool = await getPool();
    if (!pool) return null;
    const { rows } = await pool.query(
      `SELECT data FROM cache WHERE key = $1 AND expires_at > now()`,
      [key],
    );
    return rows.length ? (rows[0].data as T) : null;
  } catch {
    return null;
  }
}

export async function setCache<T>(
  key: string,
  data: T,
  ttlMs: number = 60_000,
): Promise<void> {
  try {
    const pool = await getPool();
    if (!pool) return;
    const interval = `${ttlMs} milliseconds`;
    await pool.query(
      `INSERT INTO cache (key, data, ttl_ms, created_at, expires_at)
       VALUES ($1, $2::jsonb, $3, now(), now() + $4::interval)
       ON CONFLICT (key) DO UPDATE
       SET data = $2::jsonb, ttl_ms = $3, created_at = now(), expires_at = now() + $4::interval`,
      [key, JSON.stringify(data), ttlMs, interval],
    );
  } catch {
    /* cache write failure is non-fatal */
  }
}

export async function invalidateCache(prefix?: string): Promise<void> {
  try {
    const pool = await getPool();
    if (!pool) return;
    if (!prefix) {
      await pool.query(`DELETE FROM cache`);
    } else {
      await pool.query(`DELETE FROM cache WHERE key LIKE $1`, [`${prefix}%`]);
    }
  } catch {
    /* cache invalidation failure is non-fatal */
  }
}
