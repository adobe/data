// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Notify, Observe, Unobserve } from "./index.js";

/**
 * Creates a new Observe function that will cache the last value and notify observers immediately with the last value.
 * Also prevents the base observe function from being called more than once with multiple simultaneous observers.
 */

export function withCache<T>(observable: Observe<T>): Observe<T> {
  let value: T | undefined = undefined;
  let hasValue = false;
  const observers = new Set<Notify<T>>();
  let unobserve: Unobserve | null = null;
  return (observer) => {
    observers.add(observer);
    if (hasValue) {
      observer(value as T);
    }

    if (observers.size === 1) {
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
      if (observers.size === 0 && unobserve) {
        unobserve();
        value = undefined;
        hasValue = false;
        unobserve = null;
      }
    };
  };
}
