import { beforeEach, describe, expect, it, vi } from 'vitest';

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

async function call(body: Record<string, unknown>) {
  const res = await POST(
    new Request('http://x/api/secrets/replace', { method: 'POST', body: JSON.stringify({ region: 'us-east-1', ...body }) }),
  );
  return { status: res.status, data: await res.json() };
}

beforeEach(() => {
  store.clear();
  vi.mocked(aws.putSecretValue).mockClear();
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
});
