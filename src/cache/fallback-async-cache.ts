// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type AsyncCache } from "./async-cache.js";

/**
 * Provides a combined cache interface.
 * Writes to both caches.
 * Prefers to read from the faster cache first before falling back to slower.
 */
export function createFallbackAsyncCache(
  fasterSmaller: AsyncCache<Request, Response>,
  slowerLarger: AsyncCache<Request, Response>
): AsyncCache<Request, Response> {
  return {
    async put(key: Request, value: Response): Promise<void> {
      await Promise.all([
        fasterSmaller.put(key, value),
        slowerLarger.put(key, value),
      ]);
    },
    async match(key: Request): Promise<Response | undefined> {
      return (
        (await fasterSmaller.match(key)) ?? (await slowerLarger.match(key))
      );
    },
    async delete(key: Request): Promise<void> {
      await Promise.all([fasterSmaller.delete(key), slowerLarger.delete(key)]);
    },
  };
}
