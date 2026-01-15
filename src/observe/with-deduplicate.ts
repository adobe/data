// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Observe } from "./index.js";

/**
 * Creates a new Observe function on a data value which will be cached such that
 * observers will never be notified consecutively of equivalent values.
 */
export function withDeduplicate<T>(observable: Observe<T>): Observe<T> {
  return (observer) => {
    let notified = false;
    let lastValue: T | undefined = undefined;
    return observable((value) => {
      const notify = !notified || lastValue !== value;
      if (notify) {
        notified = true;
        lastValue = value;
        observer(value);
      }
    });
  };
}
