// © 2026 Adobe. MIT License. See /LICENSE for details.
import { useElement } from "./use-element.js";
import { useEffect } from "./use-effect.js";

export interface UpdateEventHost {
    updateListeners: Set<() => void>;
}

function hasUpdateListeners(el: unknown): el is UpdateEventHost {
    return (
        typeof el === 'object' &&
        el !== null &&
        'updateListeners' in el &&
        el['updateListeners'] instanceof Set
    );
}

function makeUpdateEventHost<T extends Element>(
    el: T
): T & UpdateEventHost {
    if (hasUpdateListeners(el)) return el as T & UpdateEventHost;

    const updateListeners = new Set<() => void>();
    Object.defineProperty(el, 'updateListeners', {
        value: updateListeners,
        writable: false,
        enumerable: false,
    });

    if (!('updated' in el)) {
        throw new Error('Element does not have an updated method');
    }

    const element = el as unknown as T & {
        updated: (changedProps: Map<PropertyKey, unknown>) => void;
    } & UpdateEventHost;
    const orig = element.updated.bind(el);

    element.updated = (changedProps) => {
        orig(changedProps);
        for (const fn of updateListeners) fn();
    };

    return element;
}


export function useUpdated(listener: () => void, dependencies: unknown[] = []) {
    const element = makeUpdateEventHost(useElement());
    useEffect(() => {
        element.updateListeners.add(listener);
        return () => {
            element.updateListeners.delete(listener);
        }
    }, dependencies);
}
