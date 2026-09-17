// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect, vi } from "vitest";
import type { ReactiveController } from "lit";
import type { Component } from "./component.js";
import { installHooksController } from "./hooks-controller.js";

/**
 * Minimal stand-in for a Lit host: an EventTarget that captures the controller
 * installed on it so the test can drive `hostConnected` / `hostDisconnected`
 * directly (a real Lit element would need a DOM). `addController` mirrors Lit's
 * contract of firing `hostConnected` synchronously when already connected.
 */
class FakeHost extends EventTarget implements Component {
    isConnected = true;
    hookIndex = 0;
    hooks: any[] = [];
    updatedListeners = new Set<() => void>();
    requestUpdate = vi.fn();
    controllers: ReactiveController[] = [];

    addController(controller: ReactiveController) {
        this.controllers.push(controller);
    }
    // Simulate Lit dispatching lifecycle to every registered controller.
    connect() {
        for (const c of this.controllers) c.hostConnected?.();
    }
    disconnect() {
        for (const c of this.controllers) c.hostDisconnected?.();
    }
}

/** Resolves after the current microtask checkpoint, so deferred teardown can run. */
const flushMicrotasks = (): Promise<void> => new Promise(resolve => queueMicrotask(resolve));

describe("installHooksController", () => {
    it("disposes every effect hook and resets the cursor on a genuine disconnect", async () => {
        const host = new FakeHost();
        const disposeA = vi.fn();
        const disposeB = vi.fn();
        host.hooks = [
            { dispose: disposeA, dependencies: [] },
            42, // a value slot (useState) — must be skipped, not crash
            { dispose: disposeB, dependencies: [] },
            { current: null }, // a ref slot — no dispose
        ];
        host.hookIndex = 4;

        installHooksController(host);
        host.disconnect();
        // Teardown is deferred one microtask (so a move can cancel it); with no
        // reconnect this is a real unmount, so it runs on the next checkpoint.
        await flushMicrotasks();

        expect(disposeA).toHaveBeenCalledTimes(1);
        expect(disposeB).toHaveBeenCalledTimes(1);
        expect(host.hooks).toEqual([]);
        expect(host.hookIndex).toBe(0);
    });

    it("a synchronous disconnect→reconnect (a MOVE) cancels teardown and forces no re-render", async () => {
        const host = new FakeHost();
        const dispose = vi.fn();
        host.hooks = [{ dispose, dependencies: [] }];
        host.hookIndex = 1;

        installHooksController(host);
        host.connect(); // first mount
        host.requestUpdate.mockClear();

        // Disconnect immediately followed by reconnect, same task — a DOM move.
        host.disconnect();
        host.connect();
        await flushMicrotasks();

        // Nothing was torn down and no re-render was forced: the hooks survived.
        expect(dispose).not.toHaveBeenCalled();
        expect(host.hooks).toHaveLength(1);
        expect(host.requestUpdate).not.toHaveBeenCalled();
    });

    it("dispatches connected / disconnected events across the lifecycle", async () => {
        const host = new FakeHost();
        const onConnected = vi.fn();
        const onDisconnected = vi.fn();
        host.addEventListener("connected", onConnected);
        host.addEventListener("disconnected", onDisconnected);

        installHooksController(host);
        host.connect();
        expect(onConnected).toHaveBeenCalledTimes(1);

        host.disconnect();
        await flushMicrotasks();
        expect(onDisconnected).toHaveBeenCalledTimes(1);
    });

    it("forces a re-render only on a genuine RE-connect, not the first connect", async () => {
        const host = new FakeHost();
        installHooksController(host);

        host.connect(); // first mount
        expect(host.requestUpdate).not.toHaveBeenCalled();

        host.disconnect();
        await flushMicrotasks(); // genuine unmount: teardown runs
        host.connect(); // reconnect re-initializes the torn-down hooks
        expect(host.requestUpdate).toHaveBeenCalledTimes(1);
    });

    it("is idempotent — repeated installs register a single controller", () => {
        const host = new FakeHost();
        installHooksController(host);
        installHooksController(host);
        installHooksController(host);
        expect(host.controllers).toHaveLength(1);
    });

    it("skips hosts that are not reactive controller hosts", () => {
        const host = new EventTarget() as unknown as Component;
        expect(() => installHooksController(host)).not.toThrow();
    });
});
