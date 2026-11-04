// © 2026 Adobe. MIT License. See /LICENSE for details.

import { equalsShallow } from "@adobe/data/equals-shallow";
import { Component_stack } from "./component/stack.js";

interface Memo<T> {
    value: T;
    dependencies: unknown[];
}

export function useMemo<T>(calculateValue: () => T, dependencies: unknown[] = []): T {
    const component = Component_stack.active();
    const hookIndex = component.hookIndex++;
    const memo = component.hooks[hookIndex] as Memo<T> | undefined;
    if (memo && equalsShallow(dependencies, memo.dependencies)) {
        return memo.value;
    }
    const value = calculateValue();
    component.hooks[hookIndex] = { value, dependencies } satisfies Memo<T>;
    return value;
}