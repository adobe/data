// © 2026 Adobe. MIT License. See /LICENSE for details.
import { fromProperties } from "./from-properties.js";
import { Observe } from "./index.js";
import { withMap } from "./with-map.js";

/**
 * Given an array of observe functions, returns a single observe function that will yield an array of each value.
 */

export function fromArray<T>(
  observeFunctions: Observe<T>[]
): Observe<T[]> {
  return withMap(
    fromProperties(
      Object.fromEntries(
        observeFunctions.map((observable, index) => [index.toString(), observable])
      )
    ),
    (values) => Object.values(values)
  );
}
