// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Data } from "../index.js";
import { Observe } from "./index.js";
import { withMapData } from "./with-map-data.js";

/**
 * Returns an object which contains an observe function for each key in the input object.
 * Each individual observe function will only notify observers when it's own value has changed.
 */
export function toProperties<
  T extends { [K: string]: Data },
  Keys extends keyof T
>(
  observable: Observe<T>,
  keys: Keys[]
)
  : { readonly [K in Keys]: Observe<T[K]>; } {
  return Object.fromEntries(
    keys.map((key) => [key, withMapData(observable, (value) => value[key])])
  ) as unknown as { readonly [K in keyof T]: Observe<T[K]>; }
}
