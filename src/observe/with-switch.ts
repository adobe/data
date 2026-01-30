// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Observe, Unobserve } from "./index.js";

/**
 * Dynamically switches between observables in a record based on a key observable.
 * When the key changes, automatically unsubscribes from the previous observable and subscribes to the new one.
 *
 * @example
 * ```typescript
 * const data = {
 *   home: homeData$,
 *   profile: profileData$,
 *   settings: settingsData$
 * };
 * const currentTab$ = createState('home');
 * const currentData$ = withSwitch(data, currentTab$);
 * // When currentTab$ changes, automatically switches to observing the corresponding data observable
 * ```
 */
export function withSwitch<K extends string, T extends Record<K, Observe<any>>>(
  record: T,
  key: Observe<K>
): Observe<T[K] extends Observe<infer U> ? U : never> {
  return (observer) => {
    let currentUnsubscribe: Unobserve | null = null;

    const keyUnsubscribe = key((selectedKey) => {
      // Unsubscribe from the previous observable before subscribing to the new one
      if (currentUnsubscribe) {
        currentUnsubscribe();
      }

      // Validate that the key exists in the record
      if (!(selectedKey in record)) {
        throw new Error(
          `Key "${selectedKey}" not found in observable record. Available keys: ${Object.keys(record).join(", ")}`
        );
      }

      // Subscribe to the newly selected observable
      const selectedObservable = record[selectedKey];
      currentUnsubscribe = selectedObservable(observer);
    });

    // Return a new unsubscribe function that unsubscribes from both the key observable and current selected observable
    return () => {
      keyUnsubscribe();
      if (currentUnsubscribe) {
        currentUnsubscribe();
      }
    };
  };
}
