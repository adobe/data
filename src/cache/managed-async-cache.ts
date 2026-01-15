// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { AsyncCache, AsyncCacheWithKeys } from "./async-cache.js";

const CREATED_HEADER = "ManagedAsyncCache.Created";

export function createManagedAsyncCache(
  cache: AsyncCacheWithKeys<Request, Response>,
  optimumEntries: number
): AsyncCache<Request, Response> & {
  getKeyCountForTesting(): Promise<number>;
} {
  const maximumEntries = optimumEntries * 2;
  let putCount = 0;

  const maybeManageCacheOnPut = async () => {
    if (putCount++ % optimumEntries === 0) {
      let keys = [...(await cache.keys())];
      if (keys.length >= maximumEntries) {
        // sort by created. ISO date strings are comparable by date
        keys = keys.sort((a, b) => {
          const aheader = a.headers.get(CREATED_HEADER);
          const bheader = b.headers.get(CREATED_HEADER);
          if (!aheader || !bheader) {
            return 0;
          }
          return aheader.localeCompare(bheader);
        });
        while (keys.length > optimumEntries) {
          const key = keys.shift();
          if (key) {
            await cache.delete(key);
          }
        }
      }
    }
  };

  return {
    async put(key: Request, value: Response): Promise<void> {
      // add a created header as metadata to the request
      key.headers.set(CREATED_HEADER, new Date().toISOString());
      await cache.put(key, value);
      await maybeManageCacheOnPut();
    },

    async match(key: Request): Promise<Response | undefined> {
      return cache.match(key);
    },

    async delete(key: Request): Promise<void> {
      await cache.delete(key);
    },

    async getKeyCountForTesting(): Promise<number> {
      return (await cache.keys()).length;
    },
  };
}
