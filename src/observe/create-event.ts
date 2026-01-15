// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Notify, Observe } from "./index.js";

/**
 * Creates a new observe function that will serve as an event stream and a notify function
 * which can be used to notify all observers of a new value.
 * Note that Observers will only see values when notify is called.
 */
export function createEvent<T>(): [
  Observe<T>,
  (value: T) => void,
] {
  const observers = new Set<Notify<T>>();
  return [
    (observer) => {
      observers.add(observer);
      return () => {
        observers.delete(observer);
      };
    },
    (value) => {
      for (const observer of observers) {
        observer(value);
      }
    },
  ];
}
