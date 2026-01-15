// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type AsyncDataFunction } from "./async-data-function.js";

import { type Data } from "../../data.js";

/**
 * Returns an async function which can NOT be executed simultaneously with the same arguments.
 * Any attempt to call again while a prior call with same args is executing will return the first promise.
 * Once a promise completes, then a new call with same args could occur.
 */
export function preventParallelExecution<In extends Array<unknown>, Out>(
  fn: AsyncDataFunction<In, Out>
): AsyncDataFunction<In, Out> {
  const executing = new Map<string, Promise<Out>>();
  const synchronized = async (...args: Array<Data>): Promise<Out> => {
    const key = JSON.stringify(args);
    let promise = executing.get(key);
    if (!promise) {
      promise = fn(...(args as In));
      executing.set(key, promise);
    }
    try {
      return await promise;
    } finally {
      // we delete the key after execution to prevent memory leak.
      executing.delete(key);
    }
  };
  return synchronized as unknown as AsyncDataFunction<In, Out>;
}
