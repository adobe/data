// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { AsyncCache, AsyncCacheWithKeys } from "./async-cache.js";
import { createFallbackAsyncCache } from "./fallback-async-cache.js";
import {
  createDeferredFallbackAsyncCache,
  type DeferredFallbackAsyncCache,
} from "./deferred-fallback-async-cache.js";
import { createManagedAsyncCache } from "./managed-async-cache.js";
import { createMemoryAsyncCache } from "./memory-async-cache.js";

interface ManagedCacheOptions {
  maximumMemoryEntries: number;
  /**
   * Cap on the storage-tier entry count, enforced by periodically scanning
   * and FIFO-trimming all keys in the underlying Cache Storage bucket. Omit
   * to leave the storage tier unbounded and rely on the browser's own
   * Cache Storage eviction (coarser-grained, but avoids the recurring
   * full-bucket `keys()` scan this cap requires).
   */
  maximumStorageEntries?: number;
}

/**
 * Gets a persistent async cache.
 * @param name the namespace name for the cache.
 */
async function getUnmanagedPersistentCache(
  name: string
): Promise<AsyncCacheWithKeys<Request, Response>> {
  return globalThis.caches.open(name) as unknown as Promise<
    AsyncCacheWithKeys<Request, Response>
  >;
}

/**
 * Builds the bounded memory and storage tiers shared by the managed caches.
 */
async function createManagedTiers(
  name: string,
  options: ManagedCacheOptions
): Promise<{
  memoryCache: AsyncCache<Request, Response>;
  storageCache: AsyncCache<Request, Response>;
}> {
  const memoryCache = createManagedAsyncCache(
    createMemoryAsyncCache(),
    options.maximumMemoryEntries
  );
  const unmanagedStorageCache = await getUnmanagedPersistentCache(name);
  const storageCache =
    options.maximumStorageEntries === undefined
      ? unmanagedStorageCache
      : createManagedAsyncCache(
          unmanagedStorageCache,
          options.maximumStorageEntries
        );
  return { memoryCache, storageCache };
}

/**
 * Gets a managed persistent cache using both fast memory layer and slower storage layer.
 * @param name The namespace for this persistent cache, used to isolate cache storage.
 * @param options bounds for the memory and storage tiers.
 */
export async function getManagedPersistentCache(
  name: string,
  options: ManagedCacheOptions
): Promise<AsyncCache<Request, Response>> {
  const { memoryCache, storageCache } = await createManagedTiers(name, options);
  return createFallbackAsyncCache(memoryCache, storageCache);
}

/**
 * Like {@link getManagedPersistentCache}, but the durable (storage-tier) write
 * is deferred off the critical path — `put` resolves once the memory tier has
 * the value, and the returned cache exposes `flush()` as the durability
 * barrier. See {@link DeferredFallbackAsyncCache}.
 * @param name The namespace for this persistent cache, used to isolate cache storage.
 * @param options bounds for the memory and storage tiers.
 */
export async function getDeferredManagedPersistentCache(
  name: string,
  options: ManagedCacheOptions
): Promise<DeferredFallbackAsyncCache> {
  const { memoryCache, storageCache } = await createManagedTiers(name, options);
  return createDeferredFallbackAsyncCache(memoryCache, storageCache);
}
