// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { AsyncCacheWithKeys } from "./async-cache.js";

/**
 * This should never be used directly as it will never free cache entries making it leak memory.
 * It should only ever be used as a base cache inside of a ManagedAsyncCache.
 */
export function createMemoryAsyncCache(): AsyncCacheWithKeys<
  Request,
  Response
> {
  const cache = new Map<string, [Request, Response]>();
  return {
    put(key: Request, value: Response): Promise<void> {
      cache.set(key.url, [key, value.clone()]);
      return Promise.resolve();
    },

    match(key: Request): Promise<Response | undefined> {
      return Promise.resolve(cache.get(key.url)?.[1]?.clone());
    },

    async delete(key: Request): Promise<void> {
      await Promise.resolve(cache.delete(key.url));
    },

    keys(): Promise<ReadonlyArray<Request>> {
      return Promise.resolve([...cache.values()].map((value) => value[0]));
    },
  };
}
