// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Component_stack } from "./component/stack.js";

export function useRef<T>(initialValue: T): { current: T } {
    const component = Component_stack.active();
    const hookIndex = component.hookIndex++;
    return component.hooks[hookIndex] ??= { current: initialValue };
}
