import { describe, expect, it } from 'vitest';
import { replaceInSecretString } from './secret-replace';

describe('replaceInSecretString', () => {
  it('replaces in every matching value, including nested ones', () => {
    const secret = JSON.stringify({
      DATABASE_URL: 'postgres://old-host/app',
      nested: { replicas: ['postgres://old-host/r1', 'postgres://other/r2'] },
      API_KEY: 'k',
    });
    const { next, changes } = replaceInSecretString(secret, 'old-host', 'new-host');
    expect(JSON.parse(next)).toEqual({
      DATABASE_URL: 'postgres://new-host/app',
      nested: { replicas: ['postgres://new-host/r1', 'postgres://other/r2'] },
      API_KEY: 'k',
    });
    expect(changes.map((c) => c.key)).toEqual(['DATABASE_URL', 'nested.replicas[0]']);
  });

  it('leaves keys untouched', () => {
    const { next } = replaceInSecretString(JSON.stringify({ old_key: 'old value' }), 'old', 'new');
    expect(JSON.parse(next)).toEqual({ old_key: 'new value' });
  });

  it('keeps JSON valid when the replacement has quotes or backslashes', () => {
    const { next } = replaceInSecretString(JSON.stringify({ a: 'x' }), 'x', 'say "hi" \\o/');
    expect(JSON.parse(next)).toEqual({ a: 'say "hi" \\o/' });
  });

  it('matches text that JSON escapes in the raw string', () => {
    const { next, changes } = replaceInSecretString(JSON.stringify({ a: 'line1\nline2 "q"' }), '"q"', 'q');
    expect(changes).toHaveLength(1);
    expect(JSON.parse(next)).toEqual({ a: 'line1\nline2 q' });
  });

  it('replaces inside numbers and counts occurrences', () => {
    const { next, changes } = replaceInSecretString(JSON.stringify({ port: 5431, x: '1-1-1' }), '1', '2');
    expect(JSON.parse(next)).toEqual({ port: '5432', x: '2-2-2' });
    expect(changes.find((c) => c.key === 'x')?.occurrences).toBe(3);
  });

  it('replaces in plain-string secrets', () => {
    const { next, changes } = replaceInSecretString('host=old;backup=old', 'old', 'new');
    expect(next).toBe('host=new;backup=new');
    expect(changes).toEqual([{ key: undefined, before: 'host=old;backup=old', after: 'host=new;backup=new', occurrences: 2 }]);
  });

  it('is case-sensitive and returns the input unchanged when nothing matches', () => {
    const secret = JSON.stringify({ a: 'Old' });
    expect(replaceInSecretString(secret, 'old', 'new')).toEqual({ next: secret, changes: [] });
  });

  it('is a no-op for empty find or find === replace', () => {
    expect(replaceInSecretString('abc', '', 'x').changes).toEqual([]);
    expect(replaceInSecretString('abc', 'a', 'a').changes).toEqual([]);
  });
});
