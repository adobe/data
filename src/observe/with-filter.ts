// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Observe } from "./index.js";

/**
 * Creates a new Observe function that converts the original observe functions notify values into a new value at each notification,
 * optionally returning undefined to filter out the value.
 */
export function withFilter<T, U>(
  observable: Observe<T>,
  filter: (value: T) => U | undefined | void
): Observe<U> {
  return (observer) => {
    return observable((value) => {
      const filtered = filter(value);
      if (filtered !== undefined) {
        observer(filtered);
      }
    });
  };
}
