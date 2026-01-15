// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Observe } from "./index.js";

/**
 * Creates a new observable that will use a defaultValue whenever the observed
 * value is undefined and will always respond synchronously when called.
 */
export function withDefault<T>(defaultValue: T, observable: Observe<T | undefined>): Observe<T>
export function withDefault<T>(defaultValue: T, observable: Observe<T>): Observe<T>
export function withDefault<T>(defaultValue: T, observable: Observe<T | undefined>): Observe<T> {
  return (observer) => {
    let notified = false as boolean;
    const notify = (value?: T) => {
      notified = true;
      observer(value === undefined ? defaultValue : value);
    };

    const unobserverInternal = observable((value) => {
      notify(value);
    });

    if (!notified) {
      notify();
    }

    return unobserverInternal;
  };
}
