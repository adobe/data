// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, test, expect } from "vitest";
import { Observe } from "./index.js";
import { withCache } from "./with-cache.js";

/**
 * An instrumented source that records how many times it is subscribed/unsubscribed and lets the
 * test drive emissions, so we can assert both the replayed value and the upstream lifecycle.
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
  test("replays the last value synchronously to a later subscriber", () => {
    const source = makeSource();
    const cached = withCache(source.observable);
    cached(() => {});
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

  describe("default (release: false)", () => {
    test("never releases the upstream subscription", () => {
      const source = makeSource();
      const cached = withCache(source.observable);
      const a = cached(() => {});
      const b = cached(() => {});
      a();
      b();

      expect(source.unsubscribeCount).toBe(0);
    });

    test("replays to a subscriber that arrives after ALL previous observers left", () => {
      const source = makeSource();
      const cached = withCache(source.observable);
      const unobserve = cached(() => {});
      source.emit(42);
      unobserve(); // every observer is now gone

      let received: number | undefined;
      cached((value) => {
        received = value;
      });

      expect(received).toBe(42);
    });

    test("subscribes upstream exactly once across full observer churn", () => {
      const source = makeSource();
      const cached = withCache(source.observable);
      const a = cached(() => {});
      a();
      const b = cached(() => {});
      b();

      expect(source.subscribeCount).toBe(1);
    });
  });

  describe("release: true", () => {
    test("releases the upstream subscription when the last observer leaves", () => {
      const source = makeSource();
      const cached = withCache(source.observable, { release: true });
      const a = cached(() => {});
      const b = cached(() => {});
      a();
      expect(source.unsubscribeCount).toBe(0); // b still observing
      b();
      expect(source.unsubscribeCount).toBe(1); // last observer gone → released
    });

    test("still retains and replays the last value after releasing", () => {
      const source = makeSource();
      const cached = withCache(source.observable, { release: true });
      const unobserve = cached(() => {});
      source.emit(7);
      unobserve(); // released, but value retained

      let received: number | undefined;
      cached((value) => {
        received = value;
      });

      expect(received).toBe(7);
    });

    test("re-subscribes upstream when an observer returns after release", () => {
      const source = makeSource();
      const cached = withCache(source.observable, { release: true });
      const unobserve = cached(() => {});
      source.emit(1);
      unobserve();

      const values: number[] = [];
      cached((value) => values.push(value));
      source.emit(2); // fresh value from the re-subscribed upstream

      expect(source.subscribeCount).toBe(2); // once initially, once after release
      expect(values).toEqual([1, 2]); // replayed retained value, then fresh
    });
  });
});
