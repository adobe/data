// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect, vi } from "vitest";
import { type AsyncCache } from "./async-cache.js";
import { createDeferredFallbackAsyncCache } from "./deferred-fallback-async-cache.js";

// A tiny in-memory tier keyed by request url. Cloning mirrors the real tiers so
// a Response body can be read by more than one consumer.
function createFakeTier() {
  const store = new Map<string, Response>();
  const cache: AsyncCache<Request, Response> = {
    async put(key, value) {
      store.set(key.url, value.clone());
    },
    async match(key) {
      return store.get(key.url)?.clone();
    },
    async delete(key) {
      store.delete(key.url);
    },
  };
  return { store, cache };
}

// A slow tier whose writes can be blocked, released, failed, and counted.
function createControllableSlowTier() {
  const store = new Map<string, Response>();
  let gate: Promise<void> | undefined;
  let openGate: (() => void) | undefined;
  let failNext = false;
  const putSpy = vi.fn();

  const cache: AsyncCache<Request, Response> = {
    async put(key, value) {
      putSpy(key.url);
      if (gate) {
        await gate;
      }
      if (failNext) {
        failNext = false;
        throw new Error("quota exceeded");
      }
      store.set(key.url, value.clone());
    },
    async match(key) {
      return store.get(key.url)?.clone();
    },
    async delete(key) {
      store.delete(key.url);
    },
  };

  return {
    store,
    cache,
    putSpy,
    blockWrites() {
      gate = new Promise<void>((resolve) => {
        openGate = resolve;
      });
    },
    releaseWrites() {
      openGate?.();
      gate = undefined;
      openGate = undefined;
    },
    failNextWrite() {
      failNext = true;
    },
  };
}

const req = (url: string) => new Request(`https://test/${url}`);
const res = (body: string) => new Response(body);
const bodyOf = async (r: Response | undefined) => (r ? await r.text() : undefined);

describe("createDeferredFallbackAsyncCache", () => {
  it("resolves put before the durable write completes", async () => {
    const fast = createFakeTier();
    const slow = createControllableSlowTier();
    const cache = createDeferredFallbackAsyncCache(fast.cache, slow.cache);

    slow.blockWrites();
    await cache.put(req("a"), res("A"));

    // The durable write has not landed yet...
    expect(slow.store.has("https://test/a")).toBe(false);
    // ...but the value is already readable.
    expect(await bodyOf(await cache.match(req("a")))).toBe("A");

    slow.releaseWrites();
    await cache.flush();
    expect(slow.store.has("https://test/a")).toBe(true);
  });

  it("serves reads from pendingWrites after the fast tier evicts", async () => {
    const fast = createFakeTier();
    const slow = createControllableSlowTier();
    const cache = createDeferredFallbackAsyncCache(fast.cache, slow.cache);

    slow.blockWrites();
    await cache.put(req("a"), res("A"));

    // Simulate the bounded fast tier evicting the entry before its durable
    // write lands. The value must still resolve via pendingWrites.
    await fast.cache.delete(req("a"));
    expect(await bodyOf(await cache.match(req("a")))).toBe("A");

    // After flush drains pendingWrites, the value is served from the slow tier.
    slow.releaseWrites();
    await cache.flush();
    expect(await bodyOf(await cache.match(req("a")))).toBe("A");
  });

  it("flush resolves once every deferred write has landed", async () => {
    const fast = createFakeTier();
    const slow = createControllableSlowTier();
    const cache = createDeferredFallbackAsyncCache(fast.cache, slow.cache);

    slow.blockWrites();
    await cache.put(req("a"), res("A"));
    await cache.put(req("b"), res("B"));
    expect(slow.store.size).toBe(0);

    slow.releaseWrites();
    await cache.flush();
    expect(slow.store.size).toBe(2);
  });

  it("surfaces a durable-write failure through flush(), not silently", async () => {
    const fast = createFakeTier();
    const slow = createControllableSlowTier();
    const cache = createDeferredFallbackAsyncCache(fast.cache, slow.cache);

    slow.failNextWrite();
    await cache.put(req("a"), res("A"));

    await expect(cache.flush()).rejects.toBeInstanceOf(AggregateError);
    // The bytes remain readable in-session even though the durable write failed.
    expect(await bodyOf(await cache.match(req("a")))).toBe("A");
  });

  it("delete removes a pending value from every tier", async () => {
    const fast = createFakeTier();
    const slow = createControllableSlowTier();
    const cache = createDeferredFallbackAsyncCache(fast.cache, slow.cache);

    await cache.put(req("a"), res("A"));
    await cache.flush();
    await cache.delete(req("a"));

    expect(await cache.match(req("a"))).toBeUndefined();
    expect(slow.store.has("https://test/a")).toBe(false);
  });

  it("delete is not resurrected by an in-flight deferred write", async () => {
    const fast = createFakeTier();
    const slow = createControllableSlowTier();
    const cache = createDeferredFallbackAsyncCache(fast.cache, slow.cache);

    slow.blockWrites();
    await cache.put(req("a"), res("A"));

    // Delete races the still-gated durable write.
    const deleted = cache.delete(req("a"));
    slow.releaseWrites();
    await deleted;

    expect(await cache.match(req("a"))).toBeUndefined();
    expect(slow.store.has("https://test/a")).toBe(false);
  });

  it("coalesces repeated writes of the same key into one durable write", async () => {
    const fast = createFakeTier();
    const slow = createControllableSlowTier();
    const cache = createDeferredFallbackAsyncCache(fast.cache, slow.cache);

    slow.blockWrites();
    await cache.put(req("a"), res("A"));
    await cache.put(req("a"), res("A"));
    await cache.put(req("a"), res("A"));

    slow.releaseWrites();
    await cache.flush();
    expect(slow.putSpy).toHaveBeenCalledTimes(1);
  });
});
