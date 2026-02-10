// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Observe } from "./index.js";
import { Data } from "../data.js";
import { equals } from "../equals.js";

/**
 * Creates a new Observe function that will cache the last value and only notify observers when the value changes.
 * Performs a deep comparison of the value to determine if it has changed.
 */
export function withDeduplicateData<T extends Data>(
  observable: Observe<T>
): Observe<T> {
  return (observer) => {
    let lastValue: T | undefined = undefined;
    return observable((value) => {
      const notify = lastValue === undefined || !equals(lastValue, value);
      if (notify) {
        lastValue = value;
        observer(value);
      }
    });
  };
}
