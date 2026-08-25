// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type AsyncCache } from "./async-cache.js";

/**
 * A fallback cache whose durable (slower/larger) write is deferred off the
 * critical path. Like {@link createFallbackAsyncCache} it reads faster-first
 * and writes both tiers, but `put` resolves as soon as the fast tier has the
 * value — the slow-tier write runs in the background.
 *
 * Between `put` returning and the background write landing, the value lives in
 * an in-memory `pendingWrites` map so it is always readable (the fast tier is
 * bounded and may evict the entry before its durable write completes). `flush`
 * is the durability barrier: it resolves once every pending durable write has
 * completed, and rejects if any failed.
 */
export interface DeferredFallbackAsyncCache extends AsyncCache<Request, Response> {
  /**
   * Resolves once all deferred durable (slow-tier) writes have completed.
   * Rejects with an `AggregateError` if any deferred write has failed and has
   * not since been superseded by a successful write of the same key.
   *
   * Any layer that persists a reference to a value written here MUST await
   * `flush()` first — otherwise the persisted reference may point at bytes that
   * never reached durable storage and will not resolve after reload.
   */
  flush(): Promise<void>;
}

/**
 * Creates a fallback cache that defers the durable write.
 * @param fasterSmaller the fast, bounded tier (awaited by `put`).
 * @param slowerLarger the durable tier (written in the background).
 */
export function createDeferredFallbackAsyncCache(
  fasterSmaller: AsyncCache<Request, Response>,
  slowerLarger: AsyncCache<Request, Response>
): DeferredFallbackAsyncCache {
  // Bytes whose durable write has not yet landed, keyed by request url. Holds a
  // strong clone so the value survives fast-tier eviction until it is durable.
  const pendingWrites = new Map<string, Response>();
  // In-flight durable writes, keyed by url, so repeated puts of the same
  // content (same hash => same url) collapse to a single write.
  const inFlight = new Map<string, Promise<void>>();
  // Durable-write failures, keyed by url. Cleared when a later write of the
  // same url succeeds. Surfaced through flush().
  const failures = new Map<string, unknown>();

  return {
    async put(key: Request, value: Response): Promise<void> {
      const { url } = key;
      // Fast tier is on the critical path; await it so read-after-write holds
      // even if the entry is never consulted through pendingWrites.
      await fasterSmaller.put(key, value.clone());
      // Register the bytes so reads resolve before the durable write lands.
      pendingWrites.set(url, value.clone());
      // Schedule (or reuse) the durable write off the critical path.
      if (!inFlight.has(url)) {
        const write = slowerLarger
          .put(key, value.clone())
          .then(() => {
            pendingWrites.delete(url);
            failures.delete(url);
          })
          .catch((error: unknown) => {
            // Keep the pending bytes so in-session reads still resolve, and
            // record the failure so flush() can surface it.
            failures.set(url, error);
          })
          .finally(() => {
            inFlight.delete(url);
          });
        inFlight.set(url, write);
      }
    },

    async match(key: Request): Promise<Response | undefined> {
      return (
        (await fasterSmaller.match(key)) ??
        pendingWrites.get(key.url)?.clone() ??
        (await slowerLarger.match(key))
      );
    },

    async delete(key: Request): Promise<void> {
      const { url } = key;
      pendingWrites.delete(url);
      failures.delete(url);
      // If a deferred write is still in flight, let it settle first — otherwise
      // it could land after our delete and resurrect the entry in the durable
      // tier.
      const inflightWrite = inFlight.get(url);
      if (inflightWrite) {
        await inflightWrite.catch(() => {});
      }
      await Promise.all([fasterSmaller.delete(key), slowerLarger.delete(key)]);
    },

    async flush(): Promise<void> {
      // Drain in-flight writes, including any scheduled while we awaited.
      while (inFlight.size > 0) {
        await Promise.allSettled([...inFlight.values()]);
      }
      if (failures.size > 0) {
        throw new AggregateError(
          [...failures.values()],
          "deferred durable write(s) failed"
        );
      }
    },
  };
}
