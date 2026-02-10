// © 2026 Adobe. MIT License. See /LICENSE for details.
import { createExpiringDataCache } from "./expiring-data-cache.js"; // Adjust the import path as necessary
import { describe, expect, it } from "vitest";
import { createDataCache } from "./data-cache.js";
import { getManagedPersistentCache } from "./get-persistent-cache.js";

describe("ExpiringDataCache", () => {
  it("should store and retrieve an item before it expires", async () => {
    const time = Date.now();
    let timePassed = 0;
    const getTime = () => time + timePassed;
    const cache = createExpiringDataCache<string, string>(
      createDataCache(
        await getManagedPersistentCache("expiring-data-cache-test", {
          maximumMemoryEntries: 10,
          maximumStorageEntries: 100,
        })
      ),
      getTime
    );

    cache.put("key1", "value1", { maximumDuration: 1000 }); // Expires in 1000ms
    expect(await cache.match("key1")).toBe("value1");

    timePassed = 500;
    expect(await cache.match("key1")).toBe("value1");

    timePassed = 999;
    expect(await cache.match("key1")).toBe("value1");

    timePassed = 1000;
    expect(await cache.match("key1")).toBeUndefined();

    timePassed = 1001;
    expect(await cache.match("key1")).toBeUndefined();

    timePassed = 2000;
    expect(await cache.match("key1")).toBeUndefined();
  });

  it("should immediately expire items when maximumDuration is 0", async () => {
    const time = Date.now();
    let timePassed = 0;
    const getTime = () => time + timePassed;
    const cache = createExpiringDataCache<string, string>(
      createDataCache(
        await getManagedPersistentCache("expiring-data-cache-test", {
          maximumMemoryEntries: 10,
          maximumStorageEntries: 100,
        })
      ),
      getTime
    );

    cache.put("key1", "value1", { maximumDuration: 0 }); // Expires immediately
    expect(await cache.match("key1")).toBeUndefined();

    timePassed = 1000;
    expect(await cache.match("key1")).toBeUndefined();
  });
});
