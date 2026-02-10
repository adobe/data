// © 2026 Adobe. MIT License. See /LICENSE for details.
import { createManagedAsyncCache } from "./managed-async-cache.js";
import { createMemoryAsyncCache } from "./memory-async-cache.js";
import { describe, expect, it } from "vitest";

describe("ManagedAsyncCache", () => {
  it("should retain new data but evict old data", async () => {
    const optimum = 4;
    const maximumEntries = optimum * 2;
    const cache = createManagedAsyncCache(createMemoryAsyncCache(), optimum);
    const count = 100;
    for (let i = 0; i < count; i++) {
      await cache.put(new Request(`key:${i}`), new Response(`value:${i}`));
    }

    // make sure we don't exceed maximum keys
    const keyCount = await cache.getKeyCountForTesting();
    //  should not store more than maximum keys
    expect(keyCount <= maximumEntries).toBe(true);

    // make the last N requests still available.
    for (let k = 0; k < optimum; k++) {
      const i = count - 1 - k;
      const value = await cache.match(new Request(`key:${i}`));
      expect(value instanceof Response).toBe(true);
    }

    //  old keys should return undefined
    expect(await cache.match(new Request(`key:0`))).toBe(undefined);
    expect(await cache.match(new Request(`key:1`))).toBe(undefined);
    expect(await cache.match(new Request(`key:2`))).toBe(undefined);
  });
});
