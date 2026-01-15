// © 2026 Adobe. MIT License. See /LICENSE for details.

import { type Data } from "../data.js";
import { type DataCache, DataCacheInternal } from "./data-cache.js";

type ExpiringData<T extends Data> = {
  expiration: number | null;
  value: T;
};

/**
 * Creates a new expiring data cache with the specified underlying cache.
 */
export function createExpiringDataCache<K extends Data, V extends Data>(
  baseCache: DataCacheInternal<K, V>,
  getTime = () => Date.now()
): DataCache<K, V> {
  const cache = baseCache as unknown as DataCacheInternal<K, ExpiringData<V>>;
  return {
    async match(key: K): Promise<V | undefined> {
      const entry = await cache.match(key);
      if (!entry) {
        return undefined;
      }
      if (entry.expiration != null && entry.expiration <= getTime()) {
        await cache.delete(key);
        return undefined;
      }
      return entry.value;
    },
    async put(key: K, value: V, options): Promise<void> {
      const { maximumDuration: maxDuration } = options || {};
      const expiration =
        (maxDuration !== undefined) && maxDuration >= 0 ? getTime() + maxDuration : null;
      await cache.put(key, { value, expiration });
    },
    async delete(key: K): Promise<void> {
      await cache.delete(key);
    },
  };
}
