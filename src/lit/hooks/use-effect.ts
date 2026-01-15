// © 2026 Adobe. MIT License. See /LICENSE for details.

import { equalsShallow } from "../../equals-shallow.js";
import type { Component } from "./component/component.js"
import { Component_stack } from "./component/stack.js";

export type EffectCallback = () => (void | (() => void))
type EffectHookState = { dispose?: () => void, dependencies: unknown[] };

export function useEffect<T extends Component>(callback: EffectCallback, dependencies: unknown[] = []) {
    const component = Component_stack.active() as T;
    const hookIndex = component.hookIndex++;
    const oldHookState = component.hooks[hookIndex] as EffectHookState | undefined;
    const rerunEffect = !oldHookState || !equalsShallow(dependencies, oldHookState.dependencies);
    if (rerunEffect) {
        oldHookState?.dispose?.();
        component.hooks[hookIndex] = { dispose: callback.call(component) ?? undefined, dependencies };
    }
}
