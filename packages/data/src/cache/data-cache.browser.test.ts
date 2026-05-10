// © 2026 Adobe. MIT License. See /LICENSE for details.
import { dataCache, getDataCache } from "./data-cache.js";
import { beforeAll, describe, expect, it } from "vitest";

describe("DataCache", () => {
  beforeAll(() => {});
  it("dataCache is not a top-level await", () => {
    expect(typeof (dataCache as any).then === "undefined");
  });

  it("dataCache is lazily initialized and supports put/match/delete directly", async () => {
    const key = { test: "lazy-init", n: Date.now() };
    const value = { hello: "world" };

    await dataCache.put(key, value);
    expect(await dataCache.match(key)).toEqual(value);

    await dataCache.delete(key);
    expect(await dataCache.match(key)).toBeUndefined();
  });

  it("should allow storing and retrieving values in namespaced/versioned caches", async () => {
    //  get a namespaced cache
    const cache = await getDataCache("test:v1");

    //  create some keys and values to store
    const key = { foo: 1, bar: [{ baz: 12 }] };
    const valueIn = { alpha: "bet", bar: ["a", "b"] };

    //  store a key/value pair
    await cache.put(key, valueIn);

    //  retrieve the value
    const valueOut = await cache.match(key);

    //  output is NOT identical
    expect(valueOut !== valueIn).toBe(true);

    //  output IS structurally equal
    expect(valueOut).toEqual(valueIn);

    //  output from structurally equivalent key is the same
    expect(await cache.match(JSON.parse(JSON.stringify(key)))).toEqual(valueIn);

    //  output from equivalent cache (constructed with same name/version) is the same.
    expect(await (await getDataCache("test:v1")).match(key)).toEqual(valueIn);

    //  output from different named cache is undefined
    expect(await (await getDataCache("test2:v1")).match(key)).toEqual(
      undefined,
    );

    //  output from different cache version is undefined
    expect(await (await getDataCache("test:v2")).match(key)).toEqual(undefined);
  });
});
