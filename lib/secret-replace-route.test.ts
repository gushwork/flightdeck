import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_REPLACE_NAMES } from '@/lib/secret-replace';
import { runAsOperatorClient } from '@/lib/local-operator';

// In-memory Secrets Manager: name -> versions (last = AWSCURRENT).
const store = new Map<string, { versionId: string; secretString: string }[]>();
let versionSeq = 0;

vi.mock('@/lib/cache', () => ({ invalidateCache: vi.fn(async () => {}) }));
vi.mock('@/lib/aws/secrets', () => ({
  getSecretValue: vi.fn(async (_region: string, name: string) => {
    const versions = store.get(name);
    if (!versions) throw new Error(`Secrets Manager can't find the specified secret: ${name}`);
    const current = versions[versions.length - 1];
    return { name, arn: `arn:${name}`, secretString: current.secretString, versionId: current.versionId };
  }),
  putSecretValue: vi.fn(async (_region: string, name: string, secretString: string) => {
    const versionId = `v${++versionSeq}`;
    store.get(name)!.push({ versionId, secretString });
    return { versionId };
  }),
}));

const { POST } = await import('@/app/api/secrets/replace/route');
const aws = await import('@/lib/aws/secrets');

function seed(name: string, value: unknown) {
  store.set(name, [{ versionId: `v${++versionSeq}`, secretString: JSON.stringify(value) }]);
}
const current = (name: string) => JSON.parse(store.get(name)!.at(-1)!.secretString);

const JSON_HEADERS = { 'content-type': 'application/json' };

async function call(body: Record<string, unknown>, client = '127.0.0.1', headers: Record<string, string> = JSON_HEADERS) {
  return runAsOperatorClient(client, async () => {
    const res = await POST(
      new Request('http://x/api/secrets/replace', {
        method: 'POST',
        headers,
        body: JSON.stringify({ region: 'us-east-1', ...body }),
      }),
    );
    return { status: res.status, data: await res.json() };
  });
}

beforeEach(() => {
  store.clear();
  delete process.env.FLIGHTDECK_ALLOW_REMOTE;
  vi.mocked(aws.putSecretValue).mockClear();
  vi.mocked(aws.getSecretValue).mockClear();
});

describe('POST /api/secrets/replace', () => {
  it('dry run reports changes without writing', async () => {
    seed('app/db', { url: 'postgres://old/app' });
    const { data } = await call({ names: ['app/db'], find: 'old', replace: 'new' });
    expect(data.results[0].status).toBe('will-change');
    expect(aws.putSecretValue).not.toHaveBeenCalled();
    expect(current('app/db')).toEqual({ url: 'postgres://old/app' });
  });

  it('applies to nested values and confirms the new version', async () => {
    seed('app/db', { primary: { url: 'postgres://old/app' }, other: 'keep' });
    const { data } = await call({ names: ['app/db'], find: 'old', replace: 'new', dryRun: false });
    expect(data.results[0]).toMatchObject({ status: 'updated', versionId: store.get('app/db')!.at(-1)!.versionId });
    expect(current('app/db')).toEqual({ primary: { url: 'postgres://new/app' }, other: 'keep' });
  });

  it('works on the latest value, not the one seen at preview time', async () => {
    seed('app/db', { url: 'postgres://old/app' });
    await call({ names: ['app/db'], find: 'old', replace: 'new' });
    // Someone else edits the secret between preview and apply.
    store.get('app/db')!.push({ versionId: 'v-other', secretString: JSON.stringify({ url: 'postgres://old/app', extra: 'added' }) });

    await call({ names: ['app/db'], find: 'old', replace: 'new', dryRun: false });
    expect(current('app/db')).toEqual({ url: 'postgres://new/app', extra: 'added' });
  });

  it('does not write (or claim success) when the latest value no longer matches', async () => {
    seed('app/db', { url: 'postgres://already-new/app' });
    const { data } = await call({ names: ['app/db'], find: 'old', replace: 'new', dryRun: false });
    expect(data.results[0].status).toBe('no-match');
    expect(aws.putSecretValue).not.toHaveBeenCalled();
  });

  it('reports failure when the write is not AWSCURRENT afterwards', async () => {
    seed('app/db', { url: 'old' });
    vi.mocked(aws.putSecretValue).mockImplementationOnce(async () => ({ versionId: 'v-lost' }));
    const { data } = await call({ names: ['app/db'], find: 'old', replace: 'new', dryRun: false });
    expect(data.results[0].status).toBe('failed');
    expect(data.results[0].error).toContain('v-lost');
  });

  it('keeps going when one secret fails', async () => {
    seed('a', { v: 'old' });
    const { data } = await call({ names: ['missing', 'a'], find: 'old', replace: 'new', dryRun: false });
    expect(data.results.map((r: { status: string }) => r.status)).toEqual(['failed', 'updated']);
    expect(current('a')).toEqual({ v: 'new' });
  });

  it('rejects empty find and identical find/replace', async () => {
    expect((await call({ names: ['a'], find: '', replace: 'x' })).status).toBe(400);
    expect((await call({ names: ['a'], find: 'x', replace: 'x' })).status).toBe(400);
  });

  it('rejects a names list over the cap before it calls AWS', async () => {
    const names = Array.from({ length: MAX_REPLACE_NAMES + 1 }, (_, i) => `s${i}`);
    const { status, data } = await call({ names, find: 'old', replace: 'new', dryRun: false });
    expect(status).toBe(400);
    expect(data.error).toContain(String(MAX_REPLACE_NAMES));
    expect(aws.getSecretValue).not.toHaveBeenCalled();
  });

  it('refuses a call when the server did not record a peer', async () => {
    const res = await POST(
      new Request('http://x/api/secrets/replace', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ region: 'us-east-1', names: ['a'], find: 'old', replace: 'new' }),
      }),
    );
    expect(res.status).toBe(403);
    expect(aws.getSecretValue).not.toHaveBeenCalled();
  });

  it('refuses a cross-site text/plain post (CSRF form or no-cors fetch)', async () => {
    seed('app/db', { url: 'old' });
    const { status } = await call({ names: ['app/db'], find: 'old', replace: 'new', dryRun: false }, '127.0.0.1', {
      'content-type': 'text/plain',
    });
    expect(status).toBe(403);
    expect(aws.getSecretValue).not.toHaveBeenCalled();
  });

  it('refuses a JSON post from another origin', async () => {
    seed('app/db', { url: 'old' });
    const { status } = await call({ names: ['app/db'], find: 'old', replace: 'new', dryRun: false }, '127.0.0.1', {
      ...JSON_HEADERS,
      origin: 'https://evil.example',
      host: 'x',
    });
    expect(status).toBe(403);
    expect(aws.getSecretValue).not.toHaveBeenCalled();
  });

  it('refuses a caller that is not on this machine', async () => {
    seed('app/db', { url: 'old' });
    const { status, data } = await call({ names: ['app/db'], find: 'old', replace: 'new', dryRun: false }, '10.1.2.3');
    expect(status).toBe(403);
    expect(data.error).toContain('this machine');
    expect(aws.getSecretValue).not.toHaveBeenCalled();
    expect(current('app/db')).toEqual({ url: 'old' });
  });

  it('allows a remote caller only when FLIGHTDECK_ALLOW_REMOTE=1', async () => {
    process.env.FLIGHTDECK_ALLOW_REMOTE = '1';
    seed('app/db', { url: 'old' });
    const { data } = await call({ names: ['app/db'], find: 'old', replace: 'new', dryRun: false }, '10.1.2.3');
    expect(data.results[0].status).toBe('updated');
  });
});
