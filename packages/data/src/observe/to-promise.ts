// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Observe, Unobserve } from "./index.js";

/**
 * Converts an Observe function to a Promise that will resolve with the first value.
 * Note that you will never receive subsequent updates since promises can only resolve once.
 * @param observable source observable
 * @returns the first value yielded by the observe function.
 */
export function toPromise<T>(observable: Observe<T>): Promise<T> {
  return new Promise<T>((resolve, _reject) => {
    let unobserve: Unobserve | null = null;
    unobserve = observable((value) => {
      resolve(value);
      if (unobserve) {
        unobserve();
      }
    });
  });
}
