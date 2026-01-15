// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Observe } from "./index.js";

/**
 * Converts a constant value into an Observe<T> function.
 */

export function fromConstant<T>(value: T): Observe<T> {
  return (observer) => {
    observer(value);
    return () => {
      //  deliberately empty.
    };
  };
}
