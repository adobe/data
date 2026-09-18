// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Notify, Observe } from "./index.js";

/**
 * Like {@link withCache}, but the cache is PERSISTENT: it retains the last value and keeps its single
 * upstream subscription alive for the lifetime of the returned observable, so every new observer is
 * replayed the current value synchronously on subscribe — including an observer that arrives after all
 * previous observers have unsubscribed.
 *
 * `withCache` is reference-counted: when its last observer unsubscribes it tears down the upstream
 * subscription and clears the value, so the next observer sees a cold cache and must wait for a fresh
 * (possibly async) emission. That is correct for a short-lived source, but wrong for a long-lived,
 * app-scoped source that an observer must be able to read immediately regardless of subscription
 * timing — e.g. under a subscribe-once consumer (a hook that establishes its subscription once and
 * keeps it across DOM moves) an observable feeding {@link fromProperties} (which emits only once every
 * source has emitted) stalls forever if it subscribes while such a source is cold.
 *
 * The upstream subscription is intentionally never released: this replays to future observers for the
 * lifetime of the returned observable. Use it only for sources whose lifetime matches the app/owner
 * (the returned observable and its upstream are reclaimed together when nothing references them); for a
 * source that must release an active resource when idle, use `withCache` instead.
 */
export function withReplay<T>(observable: Observe<T>): Observe<T> {
  let value: T | undefined = undefined;
  let hasValue = false;
  let started = false;
  const observers = new Set<Notify<T>>();
  return (observer) => {
    observers.add(observer);
    if (hasValue) {
      observer(value as T);
    }
    if (!started) {
      started = true;
      observable((newValue) => {
        hasValue = true;
        value = newValue;
        for (const callback of observers) {
          callback(newValue);
        }
      });
    }
    return () => {
      observers.delete(observer);
    };
  };
}
