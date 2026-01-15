// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Notify, Observe } from "./index.js";

/**
 * Creates a simple state observe function and a setValue function to update the value.
 * When observed, the current state if any will be immediately and synchronously sent to the observer callback.
 * @param initialValue The initial value of the state.
 */
export function createState<T>(
  initialValue?: T
): [Observe<T>, (value: T) => void] {
  let value: T | undefined = initialValue;
  const observers = new Set<Notify<T>>();
  return [
    (observer) => {
      observers.add(observer);
      if (value !== undefined) {
        observer(value);
      }
      return () => {
        observers.delete(observer);
      };
    },
    (newValue) => {
      value = newValue;
      for (const observer of observers) {
        observer(newValue);
      }
    },
  ];
}
