// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Observe } from "./index.js";

/**
 * Creates a new Observer that will notify observers exactly once when the promise is resolved.
 * Note that the promise is only created when the first observer is added so it is lazy.
 */
export function fromPromise<T>(
  promiseFactory: () => Promise<T>
): Observe<T> {
  let promise: Promise<T> | undefined = undefined;
  return (observer) => {
    let cancelled = false;
    promise = promise ?? promiseFactory();
    promise.then(
      (value) => {
        if (!cancelled) {
          observer(value);
        }
      },
      (reject) => {
        console.error(`Error in Observe fromPromise`, reject);
      }
    );
    return () => {
      cancelled = true;
    };
  };
}
