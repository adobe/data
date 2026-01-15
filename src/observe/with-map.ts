// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Observe } from "./index.js";

/**
 * Creates a new Observe function that converts the original observe functions notify values into a new value at each notification.
 */
export function withMap<T, U>(
  observable: Observe<T>,
  map: (value: T) => U
): Observe<U> {
  return (observer) => {
    return observable((value) => {
      observer(map(value));
    });
  };
}
