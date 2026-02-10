// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Observe, Unobserve } from "./index.js";

/**
 * Unwraps a nested observable to provide a single observable with the inner observable's values.
 */

export function withUnwrap<T>(
  observable: Observe<Observe<T>>
): Observe<T> {
  return (observer) => {
    let currentUnsubscribe: Unobserve | null = null; // Track the current subscription

    const unsubscribe = observable((innerObservable) => {
      // Unsubscribe from the current inner observable before subscribing to the new one
      if (currentUnsubscribe) {
        currentUnsubscribe();
      }

      // Subscribe to the new inner observable and update the currentUnsubscribe
      currentUnsubscribe = innerObservable((value) => {
        observer(value);
      });
    });

    // Return a new unsubscribe function that unsubscribes from both the outer and current inner observables
    return () => {
      unsubscribe(); // Unsubscribe from the outer observable
      if (currentUnsubscribe) {
        currentUnsubscribe(); // Ensure we unsubscribe from the current inner observable
      }
    };
  };
}
