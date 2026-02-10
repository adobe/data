// © 2026 Adobe. MIT License. See /LICENSE for details.

export function* iterateSelfAndAncestors(element: Element): IterableIterator<Element> {
    let current: Element | null = element;

    while (current) {
        yield current;

        if (current instanceof HTMLSlotElement && current.assignedSlot) {
            // Move to the slot's parent if the current element is assigned to a slot
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