// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Component_stack } from "./component/stack.js";

export function useState<T>(initializer: () => T): [T, (value: T) => void]
export function useState<T>(initialValue: T): [T, (value: T) => void]
export function useState<T>(initial: () => T) {
    const component = Component_stack.active();
    const hookIndex = component.hookIndex++;
    const value = component.hooks[hookIndex] ??= (typeof initial === "function" ? initial() : initial);
    return [
        value,
        (newValue: T) => {
            component.hooks[hookIndex] = newValue;
            component.requestUpdate();
        }
    ];

}