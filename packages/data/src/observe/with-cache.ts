// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Notify, Observe, Unobserve } from "./index.js";

export interface WithCacheOptions {
  /**
   * When `true` (the default) the cache is reference-counted: the single upstream subscription is
   * opened on the first observer and torn down — and the cached value cleared — when the last
   * observer unsubscribes, so the next observer re-subscribes and sees a freshly computed value.
   * Use the default for a source that holds an active resource (a poll, a socket, an event
   * listener) that should stop while nobody is listening, or that must be re-read fresh each time.
   *
   * When `false` the upstream subscription is kept alive for the lifetime of the returned
   * observable and the last value is retained, so every new observer — including one that
   * subscribes after all previous observers have left — is replayed the current value synchronously
   * and never stalls waiting for a fresh emission. Use it for a long-lived, app-scoped source a
   * subscribe-once consumer must be able to read immediately regardless of subscription timing
   * (e.g. an async value feeding `fromProperties`, where a cold cache would stall the combination).
   */
  release?: boolean;
}

/**
 * Creates a new Observe function that caches the last value, notifies every new observer
 * immediately with it, and shares a single upstream subscription across simultaneous observers.
 *
 * By default the cache is reference-counted — see {@link WithCacheOptions.release}. Pass
 * `{ release: false }` to keep the upstream alive and retain the value for the observable's
 * lifetime, replaying it synchronously to every subscriber.
 */
export function withCache<T>(observable: Observe<T>, { release = true }: WithCacheOptions = {}): Observe<T> {
  let value: T | undefined = undefined;
  let hasValue = false;
  const observers = new Set<Notify<T>>();
  let unobserve: Unobserve | null = null;
  return (observer) => {
    observers.add(observer);
    if (hasValue) {
      observer(value as T);
    }

    if (!unobserve) {
      unobserve = observable((newValue) => {
        hasValue = true;
        value = newValue;
        for (const callback of observers) {
          callback(newValue);
        }
      });
    }

    return () => {
      observers.delete(observer);
      if (release && observers.size === 0 && unobserve) {
        unobserve();
        value = undefined;
        hasValue = false;
        unobserve = null;
      }
    };
  };
}
