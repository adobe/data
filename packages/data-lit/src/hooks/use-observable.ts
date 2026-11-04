// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Component_stack } from "./component/stack.js";
import { useEffect } from "./use-effect.js";
import { useRef } from "./use-ref.js";
import { Observe } from "@adobe/data/observe";

/**
 * Subscribes to `observable` and returns its latest value. Every notification
 * requests a render, including one that repeats the previous value or reference.
 */
export function useObservable<T>(observable: Observe<T>): T | undefined {
    const component = Component_stack.active();
    const latest = useRef<T | undefined>(undefined);
    useEffect(() => observable(value => {
        latest.current = value;
        component.requestUpdate();
    }), [observable]);
    return latest.current;
}