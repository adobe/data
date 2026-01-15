// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * This is a generalization of the browser built in Cache API.
 */
export interface AsyncCache<K, V> {
  put(key: K, value: V): Promise<void>;
  match(key: K): Promise<V | undefined>;
  delete(key: K): Promise<void>;
}

/**
 * Shouldn't be needed normally. Only used by ManagedAsyncCache.
 * We don't want to expose it externally so leaving out of main AsyncCache type.
 */
export interface AsyncCacheWithKeys<K, V> extends AsyncCache<K, V> {
  keys(): Promise<ReadonlyArray<K>>;
}
