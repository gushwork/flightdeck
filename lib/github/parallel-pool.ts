/** Run async workers over items with a bounded concurrency cap. Preserves result order. */
export async function parallelPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, concurrency);
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

/** Track max in-flight workers — for perf tests only. */
export async function parallelPoolWithMetrics<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<{ results: R[]; maxConcurrent: number }> {
  if (items.length === 0) return { results: [], maxConcurrent: 0 };

  const limit = Math.max(1, concurrency);
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let inFlight = 0;
  let maxConcurrent = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      inFlight += 1;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      try {
        results[i] = await worker(items[i], i);
      } finally {
        inFlight -= 1;
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
  await Promise.all(workers);
  return { results, maxConcurrent };
}
