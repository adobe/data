// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Component_stack } from "./component/stack.js";
import { useEffect } from "./use-effect.js";
import { useState } from "./use-state.js";

/**
 * Hook that returns the currently active component.
 * If a querySelector is provided, it returns the first match in the component's
 * shadow root, then its light DOM. The match is re-queried on every render and
 * whenever either tree's children change; a changed match requests a render.
 */
export function useElement<K extends keyof HTMLElementTagNameMap>(querySelector: K): HTMLElementTagNameMap[K] | null
export function useElement<T extends Element = HTMLElement>(querySelector: string): T | null
export function useElement<T = HTMLElement>(): T
export function useElement<T = HTMLElement>(querySelector?: string): T | null {
    const component = Component_stack.active();

    if (!querySelector) {
        return component as unknown as T;
    }

    const host = component as unknown as HTMLElement;
    const find = () => (host.shadowRoot?.querySelector(querySelector) ?? host.querySelector(querySelector)) as T | null;
    const [, setFoundElement] = useState<T | null>(null);
    const foundElement = find();
    setFoundElement(foundElement);

    useEffect(() => {
        const observer = new MutationObserver(() => setFoundElement(find()));
        for (const root of [host.shadowRoot, host]) {
            if (root) {
                observer.observe(root, { childList: true, subtree: true });
            }
        }
        return () => observer.disconnect();
    }, [querySelector]);

    return foundElement;
}
