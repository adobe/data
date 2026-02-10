// © 2026 Adobe. MIT License. See /LICENSE for details.
import { fromConstant } from "./from-constant.js";
import { Observe } from "./index.js";

/**
 * Uses DOM MutationObserver to watch for the addition or removal of an element with a specific id.
 * @param id The id of the element to watch for.
 * @returns a new Observe<Element | null> which yields null if element does not exist.
 */

export function fromElementId<T extends HTMLElement = HTMLElement>(
  ancestor: HTMLElement | ShadowRoot,
  id: string
): Observe<T | null> {
  if (id === "") {
    return fromConstant(null);
  }
  return (observer) => {
    let lastElement: T | null = null;
    const notify = () => {
      const newElement = document.getElementById(id) as T | null;
      if (!lastElement || newElement !== lastElement) {
        lastElement = newElement;
        observer(newElement);
      }
    };
    notify();
    const mutationObserver = new MutationObserver((mutations) => {
      let changed = false;
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            if ((node as T).id === id) {
              changed = true;
            }
          }
          if (!changed) {
            for (const node of mutation.removedNodes) {
              if ((node as T).id === id) {
                changed = true;
              }
            }
          }
        }
      }
      if (changed) {
        notify();
      }
    });
    mutationObserver.observe(ancestor, { childList: true, subtree: true });
    return () => {
      mutationObserver.disconnect();
    };
  };
}
