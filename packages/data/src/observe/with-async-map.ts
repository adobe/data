// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Observe } from "./index.js";

/**
 * Creates a new Observe function that converts the original observe function's values into
 * a new value at each notification using an async promise mapping function.
 */
export function withAsyncMap<T, U>(
  observable: Observe<T>,
  map: (value: T) => Promise<U>
): Observe<U> {
  return (observer) => {
    return observable(async (value) => {
      observer(await map(value));
    });
  };
}
