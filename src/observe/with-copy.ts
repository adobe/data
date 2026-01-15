// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Observe } from "./index.js";
import { withMap } from "./with-map.js";

/**
 * Makes a deep copy of the observed value using structured cloning.
 */
export function withCopy<T>(observable: Observe<T>): Observe<T> {
  return withMap(observable, (value) => {
    return structuredClone(value);
  });
}
