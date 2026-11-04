// © 2026 Adobe. MIT License. See /LICENSE for details.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactiveController } from "lit";
import type { Component } from "./component.js";
import { installHooksController } from "./hooks-controller.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

/** Disconnects a host and returns its finalization, captured instead of queued. */
function disconnect(hooks: { dispose?: () => void }[]) {
    const controllers: ReactiveController[] = [];
    const host = Object.assign(new EventTarget(), {
        isConnected: false,
        hooks,
        hookIndex: hooks.length,
        updatedListeners: new Set<() => void>(),
        requestUpdate: vi.fn(),
        addController: (controller: ReactiveController) => controllers.push(controller),
    }) as Component & EventTarget;
    let finalize!: () => void;
    vi.stubGlobal("queueMicrotask", (callback: () => void) => { finalize = callback; });
    installHooksController(host);
    controllers[0].hostDisconnected?.();
    return { host, finalize };
}

describe("installHooksController cleanup failures", () => {
    it("disposes every hook and resets slots when a disposer throws", () => {
        const later = vi.fn();
        const { host, finalize } = disconnect([
            { dispose: () => { throw new Error("first failed"); } },
            { dispose: later },
        ]);

        expect(finalize).toThrow("first failed");
        expect(later).toHaveBeenCalledTimes(1);
        expect(host.hooks).toEqual([]);
        expect(host.hookIndex).toBe(0);
    });

    it("reports multiple disposer failures together", () => {
        const { finalize } = disconnect([
            { dispose: () => { throw new Error("a"); } },
            { dispose: () => { throw new Error("b"); } },
        ]);
        let caught: unknown;
        try {
            finalize();
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeInstanceOf(AggregateError);
        expect((caught as AggregateError).errors.map(error => (error as Error).message)).toEqual(["a", "b"]);
    });

    it("does not dispose a hook twice after a failed finalization", () => {
        const dispose = vi.fn(() => { throw new Error("failed"); });
        const { finalize } = disconnect([{ dispose }]);
        expect(finalize).toThrow();
        expect(finalize).not.toThrow();
        expect(dispose).toHaveBeenCalledTimes(1);
    });
});
