/**
 * Run an async worker over items with a bounded number in flight at once.
 * Results are returned in INPUT order (not completion order) — important here because
 * rendered segments must be concatenated in sequence.
 *
 * The worker receives (item, index). If a worker rejects, the whole call rejects (callers
 * that want per-item resilience should catch inside the worker, as the compositor does).
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} limit - max concurrent workers (coerced to >= 1)
 * @param {(item: T, index: number) => Promise<R>} worker
 * @returns {Promise<R[]>}
 */
export async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  const max = Math.max(1, Math.floor(limit) || 1);
  let next = 0;

  async function runner() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }

  const runners = [];
  for (let i = 0; i < Math.min(max, items.length); i++) runners.push(runner());
  await Promise.all(runners);
  return results;
}
