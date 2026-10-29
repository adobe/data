// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Component_stack } from "./component/stack.js";

interface State<T> {
    value: T;
    setValue: (value: T) => void;
}

export function useState<T>(initializer: () => T): [T, (value: T) => void]
export function useState<T>(initialValue: T): [T, (value: T) => void]
export function useState<T>(initial: T | (() => T)): [T, (value: T) => void] {
    const component = Component_stack.active();
    const hookIndex = component.hookIndex++;
    const state: State<T> = component.hooks[hookIndex] ??= {
        value: typeof initial === "function" ? (initial as () => T)() : initial,
        setValue: (newValue: T) => {
            if (Object.is(state.value, newValue)) return;
            state.value = newValue;
            component.requestUpdate();
        },
    };
    return [state.value, state.setValue];
}