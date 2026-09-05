// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Component } from "./component/component.js";
import { Component_stack } from "./component/stack.js";
import { installHooksController } from "./component/hooks-controller.js";

export function withHooks<This extends Component, Args extends any[], Return>(
    target: object,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<(this: This, ...args: Args) => Return>
): TypedPropertyDescriptor<(this: This, ...args: Args) => Return> {
    const originalMethod = descriptor.value!;
    descriptor.value = function (this: This, ...args: Args): Return {
        // Give the host a real disconnect edge so effect/subscription cleanups
        // actually run on unmount. Idempotent per host, so double-wrapped
        // `render` methods install it only once.
        installHooksController(this);
        Component_stack.push(this);
        try {
            return originalMethod.apply(this, args);
        }
        finally {
            Component_stack.pop();
        }
    }
    return descriptor;
}
