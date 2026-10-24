import { afterEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.fn(
  (_cmd: string, _args: string[], _opts: unknown, cb: (err: Error | null, out: { stdout: string }) => void) => {
    setTimeout(() => cb(null, { stdout: "tok\n" }), 5);
  },
);
vi.mock("child_process", () => ({ execFile: execFileMock }));

const { getGithubToken, githubFetch, invalidateGithubToken, invalidateMemo, memoize } = await import("./client");

afterEach(() => {
  vi.unstubAllGlobals();
  invalidateGithubToken();
});

describe("getGithubToken", () => {
  it("shares one gh process across concurrent callers", async () => {
    execFileMock.mockClear();
    const tokens = await Promise.all([getGithubToken(), getGithubToken(), getGithubToken()]);
    expect(tokens).toEqual(["tok", "tok", "tok"]);
    expect(execFileMock).toHaveBeenCalledTimes(1);
  });
});

describe("memoize", () => {
  it("dedupes concurrent calls and evicts rejections", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(1);
    await expect(memoize("k", 1_000, fn)).rejects.toThrow("boom");
    const [a, b] = await Promise.all([memoize("k", 1_000, fn), memoize("k", 1_000, fn)]);
    expect([a, b]).toEqual([1, 1]);
    expect(fn).toHaveBeenCalledTimes(2);
    invalidateMemo("k");
    await memoize("k", 1_000, fn);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("githubFetch ETag revalidation", () => {
  it("sends If-None-Match and reuses the cached body on 304", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ n: 1 }), { status: 200, headers: { ETag: '"abc"' } }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await githubFetch("/repos/o/r")).toEqual({ n: 1 });
    expect(await githubFetch("/repos/o/r")).toEqual({ n: 1 });
    const secondHeaders = fetchMock.mock.calls[1][1].headers as Record<string, string>;
    expect(secondHeaders["If-None-Match"]).toBe('"abc"');
  });
});
