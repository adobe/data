// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Yields `element` and its ancestors along the composed tree: assigned slots, parents, then shadow hosts. */
export function* iterateSelfAndAncestors(element: Element): IterableIterator<Element> {
    let current: Element | null = element;

    while (current) {
        yield current;

        if (current.assignedSlot) {
            current = current.assignedSlot;
        } else if (current.parentNode instanceof Element) {
            // Move up to the parent node if it is an element
            current = current.parentNode;
        } else if ((current.getRootNode() as ShadowRoot).host) {
            // Move to the host element if we're at a shadow root
            current = (current.getRootNode() as ShadowRoot).host;
        } else {
            // If no more ancestors, stop the iteration
            current = null;
        }
    }
}