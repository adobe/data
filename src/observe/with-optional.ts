// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Observe } from "./index.js";

/**
 * Creates a new Observe function that may be undefined but will always yield a result or undefined synchronously when called.
 */
export const withOptional = <T>(
  observable: Observe<T>
): Observe<T | undefined> => {
  return (observer) => {
    let notified = false as boolean;
    const notify = (value?: T) => {
      notified = true;
      observer(value);
    };

    const unobserverInternal = observable((value) => {
      notify(value);
    });

    if (!notified) {
      notify();
    }

    return unobserverInternal;
  };
};
