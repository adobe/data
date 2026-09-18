// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Notify, Observe, Unobserve } from "./index.js";

export interface WithCacheOptions {
  /**
   * When `true`, the upstream subscription is torn down once the last observer unsubscribes and
   * re-established when a new observer subscribes — releasing any active upstream resource while
   * idle. When `false` (the default) the single upstream subscription is kept alive for the
   * lifetime of the returned observable.
   *
   * Either way the last value is retained and replayed synchronously to every new observer
   * (including one that subscribes after all previous observers have left), so a subscriber never
   * stalls waiting for a fresh emission. Use `release: true` for a source that holds an active
   * resource (a poll, a socket, an event listener) that should stop while nobody is listening.
   */
  release?: boolean;
}

/**
 * Creates a new Observe function that caches the last value, notifies every new observer
 * immediately with it, and shares a single upstream subscription across simultaneous observers.
 *
 * The last value is always retained and replayed on subscribe — even to an observer that arrives
 * after all previous observers have unsubscribed. The {@link WithCacheOptions.release} flag
 * controls only whether the upstream subscription is torn down while idle (default: kept alive).
 */
export function withCache<T>(observable: Observe<T>, { release = false }: WithCacheOptions = {}): Observe<T> {
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
        // Release the upstream resource while idle, but retain the last value so the next
        // observer is replayed it synchronously (upstream re-subscribes for fresh values).
        unobserve();
        unobserve = null;
      }
    };
  };
}
