// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Component_stack } from "./component/stack.js";
import { useEffect } from "./use-effect.js";
import { useState } from "./use-state.js";

/**
 * Hook that returns the currently active component.
 * If a querySelector is provided, it dynamically observes for child elements
 * matching the selector and triggers rerender when found.
 */
export function useElement<K extends keyof HTMLElementTagNameMap>(querySelector: K): HTMLElementTagNameMap[K] | null
export function useElement<T = HTMLElement>(): T
export function useElement<T = HTMLElement>(querySelector?: string): T | null {
    const component = Component_stack.active();
    
    // If no querySelector provided, return the active component
    if (!querySelector) {
        return component as unknown as T;
    }

    // Use state to track the found element
    const [foundElement, setFoundElement] = useState<T | null>(null);
    
    useEffect(() => {
        const element = component as unknown as HTMLElement;
        
        // Check if element already exists
        const existingElement = element.querySelector(querySelector) as T | null;
        if (existingElement) {
            setFoundElement(existingElement);
            return;
        }
        
        // Set up MutationObserver to watch for new child elements
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    // Check if any added nodes match the selector
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node as Element;
                            // Check if the added node itself matches
                            if (element.matches(querySelector)) {
                                setFoundElement(element as T);
                                observer.disconnect();
                                return;
                            }
                            // Check if any descendant matches
                            const descendant = element.querySelector(querySelector) as T | null;
                            if (descendant) {
                                setFoundElement(descendant);
                                observer.disconnect();
                                return;
                            }
                        }
                    }
                }
            }
        });
        
        // Start observing both element and shadowRoot
        for (const observe of [element.shadowRoot, element]) {
            if (observe) {
                observer.observe(observe, {
                    childList: true,
                    subtree: true
                });
            }
        }
        observer.observe(element.shadowRoot ?? element, {
            childList: true,
            subtree: true
        });
        
        // Cleanup function
        return () => {
            observer.disconnect();
        };
    }, [querySelector]);
    
    return foundElement;
}
