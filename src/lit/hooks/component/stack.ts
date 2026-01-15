// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Component } from "./component.js";

const activeComponentStack: Component[] = [];
export const Component_stack = {
    active(): Component {
        return activeComponentStack[activeComponentStack.length - 1]!;
    },
    push(component: Component) {
        component.hookIndex = 0;
        component.hooks ??= [];
        activeComponentStack.push(component)
    },
    pop() {
        activeComponentStack.pop()
    }
} as const;

