// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Data } from "../index.js";
import { Observe } from "./index.js";
import { withCopy } from "./with-copy.js";
import { withDeduplicateData } from "./with-deduplicate-data.js";
import { withMap } from "./with-map.js";

/**
 * A higher order observable that maps to a specific data value, deduplicates the data, and copies the data.
 * withMapData(observable, map) = withCopy(withDeduplicateData(withMap(observable, map)))
 */
export function withMapData<T, U extends Data>(
  observable: Observe<T>,
  map: (value: T) => U
): Observe<U> {
  return withCopy(withDeduplicateData(withMap(observable, map)));
}
