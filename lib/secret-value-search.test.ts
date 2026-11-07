import { describe, expect, it } from 'vitest';
import { findSecretValueMatches } from './secret-value-search';

describe('findSecretValueMatches', () => {
  it('returns every matching top-level key, not just the first', () => {
    const secret = JSON.stringify({
      DATABASE_URL: 'postgres://main.internal/app',
      REPLICA_URL: 'postgres://replica.internal/app',
      API_KEY: 'abc',
    });
    const matches = findSecretValueMatches(secret, 'postgres');
    expect(matches.map((m) => m.key)).toEqual(['DATABASE_URL', 'REPLICA_URL']);
  });

  it('finds nested values and reports their path', () => {
    const secret = JSON.stringify({
      db: { primary: { host: 'db1.example.com' }, replicas: [{ host: 'db2.example.com' }] },
    });
    const matches = findSecretValueMatches(secret, 'example.com');
    expect(matches.map((m) => m.key)).toEqual(['db.primary.host', 'db.replicas[0].host']);
  });

  it('matches key names and shows the whole value under that key', () => {
    const secret = JSON.stringify({ redis: { host: 'r', port: 6379 } });
    const [match] = findSecretValueMatches(secret, 'REDIS');
    expect(match.key).toBe('redis');
    expect(match.context).toContain('6379');
  });

  it('does not false-match "[object Object]"', () => {
    expect(findSecretValueMatches(JSON.stringify({ a: { b: 1 } }), 'object')).toEqual([]);
  });

  it('matches numbers and booleans', () => {
    const matches = findSecretValueMatches(JSON.stringify({ port: 5432, tls: true }), '5432');
    expect(matches).toHaveLength(1);
    expect(matches[0].key).toBe('port');
  });

  it('searches plain-string secrets', () => {
    const matches = findSecretValueMatches('-----BEGIN KEY-----\nzzz\n-----END KEY-----', 'zzz');
    expect(matches).toHaveLength(1);
    expect(matches[0].key).toBeUndefined();
    expect(matches[0].context).toContain('zzz');
  });

  it('returns nothing for empty query or no hit', () => {
    expect(findSecretValueMatches('{"a":"b"}', '  ')).toEqual([]);
    expect(findSecretValueMatches('{"a":"b"}', 'zzz')).toEqual([]);
  });
});
