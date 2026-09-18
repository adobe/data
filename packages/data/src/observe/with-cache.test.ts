// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, test, expect } from "vitest";
import { Observe } from "./index.js";
import { withCache } from "./with-cache.js";

/**
 * An instrumented source that records how many times it is subscribed/unsubscribed and lets the
 * test drive emissions, so we can assert both the replayed value and the upstream lifecycle. It
 * does NOT emit on subscribe, so a cold cache replays nothing until the next `emit`.
 */
function makeSource() {
  let subscribeCount = 0;
  let unsubscribeCount = 0;
  const observers = new Set<(value: number) => void>();
  const observable: Observe<number> = (observer) => {
    subscribeCount++;
    observers.add(observer);
    return () => {
      unsubscribeCount++;
      observers.delete(observer);
    };
  };
  return {
    observable,
    emit: (value: number) => {
      for (const observer of observers) observer(value);
    },
    get subscribeCount() {
      return subscribeCount;
    },
    get unsubscribeCount() {
      return unsubscribeCount;
    },
  };
}

describe("withCache", () => {
  test("replays the last value synchronously to a simultaneous later subscriber", () => {
    const source = makeSource();
    const cached = withCache(source.observable);
    cached(() => {}); // keep the cache active
    source.emit(1);
    source.emit(2);

    let received: number | undefined;
    cached((value) => {
      received = value;
    });

    expect(received).toBe(2);
  });

  test("shares a single upstream subscription across simultaneous observers", () => {
    const source = makeSource();
    const cached = withCache(source.observable);
    cached(() => {});
    cached(() => {});
    cached(() => {});

    expect(source.subscribeCount).toBe(1);
  });

  test("forwards subsequent values to every current observer", () => {
    const source = makeSource();
    const cached = withCache(source.observable);
    const aValues: number[] = [];
    const bValues: number[] = [];
    cached((value) => aValues.push(value));
    cached((value) => bValues.push(value));

    source.emit(1);
    source.emit(2);

    expect(aValues).toEqual([1, 2]);
    expect(bValues).toEqual([1, 2]);
  });

  describe("default (release: true)", () => {
    test("tears down upstream when the last observer leaves", () => {
      const source = makeSource();
      const cached = withCache(source.observable);
      const a = cached(() => {});
      const b = cached(() => {});
      a();
      expect(source.unsubscribeCount).toBe(0); // b still observing
      b();
      expect(source.unsubscribeCount).toBe(1); // last observer gone → torn down
    });

    test("clears the cache after the last observer leaves — a later subscriber sees a cold cache", () => {
      const source = makeSource();
      const cached = withCache(source.observable);
      const unobserve = cached(() => {});
      source.emit(42);
      unobserve(); // teardown + clear

      let received: number | undefined;
      cached((value) => {
        received = value;
      });

      expect(received).toBeUndefined(); // nothing replayed; source has not re-emitted
      expect(source.subscribeCount).toBe(2); // re-subscribed cold on the new observer
    });
  });

  describe("release: false", () => {
    test("never releases the upstream subscription", () => {
      const source = makeSource();
      const cached = withCache(source.observable, { release: false });
      const a = cached(() => {});
      const b = cached(() => {});
      a();
      b();

      expect(source.unsubscribeCount).toBe(0);
    });

    test("retains and replays the last value to a subscriber that arrives after ALL previous observers left", () => {
      const source = makeSource();
      const cached = withCache(source.observable, { release: false });
      const unobserve = cached(() => {});
      source.emit(42);
      unobserve(); // every observer is gone, but the value is retained

      let received: number | undefined;
      cached((value) => {
        received = value;
      });

      expect(received).toBe(42);
    });

    test("subscribes upstream exactly once across full observer churn", () => {
      const source = makeSource();
      const cached = withCache(source.observable, { release: false });
      const a = cached(() => {});
      a();
      const b = cached(() => {});
      b();

      expect(source.subscribeCount).toBe(1);
    });
  });
});
