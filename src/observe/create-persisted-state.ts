// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Data } from "../index.js";
import { createState } from "./create-state.js";
import { Observe } from "./index.js";

/**
 * Creates a simple state observable that also returns a function to update the value.
 * The state is persisted to the provided storage.
 * Since this is stored in localStorage or sessionStorage it should not be used for large data.
 * @param key The key to use for storage.
 * @param initialValue The initial value of the state.
 * @param storage The storage to use for persistence.
 */
export function createPersistedState<T extends Data>(
  key: string,
  initialValue?: T,
  storage = localStorage
): [Observe<T>, (value: T) => void] {
  // Try to load initial state from storage
  let storedValue: T | undefined;
  const storedData = storage.getItem(key);
  if (storedData) {
    try {
      storedValue = JSON.parse(storedData) as T;
    } catch (e) {
      console.warn(`Error parsing stored data for key ${key}:`, e);
    }
  }

  // Create observable state with either stored or initial value
  const [observable, setValue] = createState(storedValue ?? initialValue);

  // Wrap setValue to persist changes to storage
  const setValueAndStore = (value: T) => {
    setValue(value);
    storage.setItem(key, JSON.stringify(value));
  };

  return [observable, setValueAndStore];
}
