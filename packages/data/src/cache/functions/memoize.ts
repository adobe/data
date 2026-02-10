// © 2026 Adobe. MIT License. See /LICENSE for details.

import { preventParallelExecution } from "./prevent-parallel-execution.js";
import { AsyncDataFunction } from "./async-data-function.js";

import { type Data } from "../../data.js";
import { getDataCache } from "../index.js";

/**
 * Uses datacache to store results so we can avoid expensive recomputations of the same input.
 * This function also uses preventParallelExecution to prevent multiple executions of the same function at the same time with the same arguments.
 * @param uniqueNameAndVersion Application-unique identifier that also encodes a version to avoid stale caches.
 * @param fn The function to memoize by storing results in the DataCache.
 * @returns A function with the same signature but memoized results.
 */
export function memoize<In extends object, Out>(
  fn: (input: In) => Out
): (input: In) => Out
export function memoize<In extends Array<Data>, Out extends Data>(
  uniqueNameAndVersion: string,
  fn: AsyncDataFunction<In, Out>
): AsyncDataFunction<In, Out>
export function memoize<In extends Array<Data>, Out extends Data>(
  uniqueNameAndVersionOrFn: string | ((input: In) => Out),
  fn?: AsyncDataFunction<In, Out>
): AsyncDataFunction<In, Out> | ((input: In) => Out) {
  if (typeof uniqueNameAndVersionOrFn === "function") {
    const fn = uniqueNameAndVersionOrFn;
    const cache = new WeakMap<In, Out>();
    return (input: In) => {
      const cached = cache.get(input);
      if (cached !== undefined) {
        return cached;
      }
      const result = fn(input);
      cache.set(input, result);
      return result;
    };
  }
  if (typeof uniqueNameAndVersionOrFn === "string" && fn !== undefined) {
    // synchronize the function to prevent executing same requests simultaneously.
    fn = preventParallelExecution(fn);
    const cache = getDataCache(uniqueNameAndVersionOrFn);
    const memoized = async (...args: Array<Data>): Promise<Data> => {
      const cachedResult = await cache.match(args);
      if (cachedResult !== undefined) {
        return cachedResult;
      }
      const result = await fn!(...(args as In));
      await cache.put(args, result);
      return result;
    };
    return memoized as unknown as AsyncDataFunction<In, Out>;
  }
  throw new Error(/* Impossible */);
}
