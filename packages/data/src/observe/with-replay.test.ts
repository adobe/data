// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, test, expect } from "vitest";
import { Observe } from "./index.js";
import { withReplay } from "./with-replay.js";
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

describe("withReplay", () => {
  test("replays the last value synchronously to a later subscriber", () => {
    const source = makeSource();
    const replayed = withReplay(source.observable);
    const unobserve = replayed(() => {});
    source.emit(1);
    source.emit(2);

    let received: number | undefined;
    replayed((value) => {
      received = value;
    });

    expect(received).toBe(2);
    unobserve();
  });

  test("replays to a subscriber that arrives after ALL previous observers left", () => {
    const source = makeSource();
    const replayed = withReplay(source.observable);
    const unobserve = replayed(() => {});
    source.emit(42);
    unobserve(); // every observer is now gone

    let received: number | undefined;
    replayed((value) => {
      received = value;
    });

    expect(received).toBe(42);
  });

  test("withCache does NOT replay after all observers left (the regression this fixes)", () => {
    const source = makeSource();
    const cached = withCache(source.observable);
    const unobserve = cached(() => {});
    source.emit(42);
    unobserve(); // withCache tears down upstream and clears the cached value

    let received: number | undefined;
    cached((value) => {
      received = value;
    });

    // A cold withCache stalls a late subscriber until a fresh async emission — the exact
    // failure withReplay avoids for long-lived, app-scoped sources.
    expect(received).toBeUndefined();
  });

  test("subscribes upstream exactly once across many observers and full churn", () => {
    const source = makeSource();
    const replayed = withReplay(source.observable);
    const a = replayed(() => {});
    const b = replayed(() => {});
    a();
    b();
    const c = replayed(() => {});
    c();

    expect(source.subscribeCount).toBe(1);
  });

  test("never releases the upstream subscription", () => {
    const source = makeSource();
    const replayed = withReplay(source.observable);
    const a = replayed(() => {});
    const b = replayed(() => {});
    a();
    b();

    expect(source.unsubscribeCount).toBe(0);
  });

  test("forwards subsequent values to every current observer", () => {
    const source = makeSource();
    const replayed = withReplay(source.observable);
    const aValues: number[] = [];
    const bValues: number[] = [];
    replayed((value) => aValues.push(value));
    replayed((value) => bValues.push(value));

    source.emit(1);
    source.emit(2);

    expect(aValues).toEqual([1, 2]);
    expect(bValues).toEqual([1, 2]);
  });
});
