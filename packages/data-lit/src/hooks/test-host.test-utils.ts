// © 2026 Adobe. MIT License. See /LICENSE for details.
import { vi } from "vitest";
import type { Component } from "./component/component.js";
import { Component_stack } from "./component/stack.js";

export type TestHost = HTMLElement & Component;

/** A detached element that hooks can render into; `requestUpdate` is a mock. */
export function createHost(): TestHost {
    return Object.assign(document.createElement("div"), {
        hookIndex: 0,
        hooks: [] as unknown[],
        updatedListeners: new Set<() => void>(),
        requestUpdate: vi.fn(),
    }) as unknown as TestHost;
}

export function render<T>(host: Component, hooks: () => T): T {
    Component_stack.push(host);
    try {
        return hooks();
    } finally {
        Component_stack.pop();
    }
}

/** Disposes and clears every hook slot, as a genuine unmount does. */
export function unmount(host: Component): void {
    for (const hook of host.hooks) {
        (hook as { dispose?: () => void } | undefined)?.dispose?.();
    }
    host.hooks = [];
    host.hookIndex = 0;
}

const pointer = (type: string, clientX: number, pointerId: number, button = 0) =>
    new PointerEvent(type, { clientX, clientY: 0, pointerId, button, bubbles: true });

export const pointerDown = (target: EventTarget, x = 0, pointerId = 1, button = 0) =>
    target.dispatchEvent(pointer("pointerdown", x, pointerId, button));
export const pointerMove = (x: number, pointerId = 1) => window.dispatchEvent(pointer("pointermove", x, pointerId));
export const pointerUp = (x: number, pointerId = 1) => window.dispatchEvent(pointer("pointerup", x, pointerId));
export const pointerCancel = (pointerId = 1) => window.dispatchEvent(pointer("pointercancel", 0, pointerId));
