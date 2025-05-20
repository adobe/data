/*MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/
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
