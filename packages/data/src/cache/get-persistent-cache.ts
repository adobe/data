// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { AsyncCache, AsyncCacheWithKeys } from "./async-cache.js";
import { createFallbackAsyncCache } from "./fallback-async-cache.js";
import { createManagedAsyncCache } from "./managed-async-cache.js";
import { createMemoryAsyncCache } from "./memory-async-cache.js";

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
 * Gets a managed persistent cache using both fast memory layer and slower storage layer.
 * @param name The namespace for this persistent cache, used to isolate cache storage.
 * @param maximumMemoryEntries
 * @param maximumStorageEntries
 * @returns
 */
export async function getManagedPersistentCache(
  name: string,
  options: {
    maximumMemoryEntries: number;
    maximumStorageEntries: number;
  }
): Promise<AsyncCache<Request, Response>> {
  const memoryCache = createManagedAsyncCache(
    createMemoryAsyncCache(),
    options.maximumMemoryEntries
  );
  const storageCache = createManagedAsyncCache(
    await getUnmanagedPersistentCache(name),
    options.maximumStorageEntries
  );
  return createFallbackAsyncCache(memoryCache, storageCache);
}
