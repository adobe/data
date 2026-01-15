// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Observe } from "./index.js";

/**
 * Creates a new Observer that will notify observers exactly once when the promise is resolved.
 * In the event of an error, the observer will be notified with the error.
 * Note that the promise is only created when the first observer is added so it is lazy.
 */
export function fromPromiseWithError<T, E extends Error>(
  promiseFactory: () => Promise<T>
): Observe<T | E> {
  let promise: Promise<T> | undefined = undefined;
  return (observer) => {
    let cancelled = false;
    promise = promise ?? promiseFactory();
    promise
      .then((value) => {
        if (!cancelled) {
          observer(value);
        }
      })
      .catch((error: E) => {
        if (!cancelled) {
          observer(error);
        }
      });
    return () => {
      cancelled = true;
    };
  };
}
