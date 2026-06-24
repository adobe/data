// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Observe } from "./index.js";

/**
 * Creates a new Observe function that converts values, using `undefined` (or `void`) as the skip signal.
 * U must not include `undefined` — if the filter can legitimately produce `undefined` as a value,
 * use `withMap` instead and handle absent values downstream.
 */
export function withFilter<T, U extends {} | null>(
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
