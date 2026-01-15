// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Observe } from "./index.js";

//  private helper function to create an observable from an element property and events.
export function fromElementPropertyAndEvents<
  T extends HTMLElement,
  K extends keyof T,
  E extends keyof HTMLElementEventMap,
>(element: T, property: K, events: E[]): Observe<T[K]> {
  return (observer) => {
    const listener = () => {
      observer(element[property]);
    };

    for (const event of events) {
      element.addEventListener(event, listener);
    }

    observer(element[property]);

    return () => {
      for (const event of events) {
        element.removeEventListener(event, listener);
      }
    };
  };
}
