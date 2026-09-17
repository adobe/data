// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect, vi } from "vitest";
import type { ReactiveController } from "lit";
import type { Component } from "./component.js";
import { installHooksController } from "./hooks-controller.js";

/**
 * Minimal stand-in for a Lit host: an EventTarget that captures the controller
 * installed on it so the test can drive `hostConnected` / `hostDisconnected`
 * directly (a real Lit element would need a DOM). `connect()` / `disconnect()`
 * flip `isConnected` BEFORE dispatching, mirroring the DOM (the callback runs
 * after connectedness has already changed) — the controller's deferred
 * finalization reads `isConnected` to tell a move from a genuine unmount.
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
    connect() {
        this.isConnected = true;
        for (const c of this.controllers) c.hostConnected?.();
    }
    disconnect() {
        this.isConnected = false;
        for (const c of this.controllers) c.hostDisconnected?.();
    }
}

/** Resolves after the current microtask checkpoint, so deferred finalization can run. */
const flushMicrotasks = (): Promise<void> => new Promise(resolve => queueMicrotask(resolve));

describe("installHooksController", () => {
    it("finalizes every effect hook and resets the cursor on a genuine disconnect", async () => {
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
        // Finalization is deferred one microtask (so a move can cancel it); with no
        // reconnect the host is still disconnected, so it runs on the next checkpoint.
        await flushMicrotasks();

        expect(disposeA).toHaveBeenCalledTimes(1);
        expect(disposeB).toHaveBeenCalledTimes(1);
        expect(host.hooks).toEqual([]);
        expect(host.hookIndex).toBe(0);
    });

    it("fires the connect / disconnect EDGE synchronously — no microtask needed", () => {
        const host = new FakeHost();
        const onConnected = vi.fn();
        const onDisconnected = vi.fn();
        host.addEventListener("connected", onConnected);
        host.addEventListener("disconnected", onDisconnected);

        installHooksController(host);
        host.connect();
        expect(onConnected).toHaveBeenCalledTimes(1);

        host.disconnect();
        // No flush: the edge is synchronous so connectedness hooks (useConnected)
        // tear down inline. Under the old defer-everything controller this event
        // only fired on a later microtask.
        expect(onDisconnected).toHaveBeenCalledTimes(1);
    });

    it("across a MOVE: fires both edges synchronously, PRESERVES the slot, and re-renders on reconnect", async () => {
        const host = new FakeHost();
        const dispose = vi.fn();
        host.hooks = [{ dispose, dependencies: [] }];
        host.hookIndex = 1;
        const edges: string[] = [];
        host.addEventListener("disconnected", () => edges.push("disconnect"));
        host.addEventListener("connected", () => edges.push("connect"));

        installHooksController(host);
        host.connect(); // initial mount
        host.requestUpdate.mockClear();
        edges.length = 0;

        // Move: disconnect immediately followed by reconnect, same task.
        host.disconnect();
        host.connect();
        expect(edges).toEqual(["disconnect", "connect"]); // both edges, synchronous, in order

        await flushMicrotasks();
        // The slot SURVIVED the move — not disposed, not re-created...
        expect(dispose).not.toHaveBeenCalled();
        expect(host.hooks).toHaveLength(1);
        // ...but the reconnect DID force one re-render. This is correctness, not churn:
        // the preserved slot is not re-subscribed, so it is a cheap Lit diff — required
        // so an element reading mutable non-hook state in render refreshes after a move.
        expect(host.requestUpdate).toHaveBeenCalledTimes(1);
    });

    it("a rapid disconnect→connect→disconnect bounce finalizes exactly once (net state wins)", async () => {
        const host = new FakeHost();
        const dispose = vi.fn();
        host.hooks = [{ dispose, dependencies: [] }];

        installHooksController(host);
        // Bounce within one task: only one finalization microtask is queued, and it
        // reads the final isConnected (false) → finalizes once, not per disconnect.
        host.disconnect();
        host.connect();
        host.disconnect();
        await flushMicrotasks();

        expect(dispose).toHaveBeenCalledTimes(1);
        expect(host.hooks).toEqual([]);
    });

    it("gates finalization on isConnected — a slot that reconnects before the microtask survives", async () => {
        const host = new FakeHost();
        const dispose = vi.fn();
        host.hooks = [{ dispose, dependencies: [] }];

        installHooksController(host);
        host.disconnect(); // schedules finalization; isConnected now false
        host.connect(); // reconnects in the same task; isConnected back to true
        await flushMicrotasks();

        expect(dispose).not.toHaveBeenCalled();
        expect(host.hooks).toHaveLength(1);
    });

    it("forces a re-render on EVERY reconnect — a move and a genuine remount — but not the first connect", async () => {
        const host = new FakeHost();
        installHooksController(host);

        host.connect(); // first mount — Lit renders it anyway, no forced update
        expect(host.requestUpdate).not.toHaveBeenCalled();

        // A MOVE (reconnect with slots preserved) forces a re-render.
        host.disconnect();
        host.connect();
        await flushMicrotasks(); // finalization skipped (reconnected in the same task)
        expect(host.requestUpdate).toHaveBeenCalledTimes(1);

        // A genuine unmount+remount (slots finalized) also forces a re-render, which
        // re-initializes and re-subscribes the cleared slots.
        host.requestUpdate.mockClear();
        host.disconnect();
        await flushMicrotasks(); // genuine unmount: finalization runs
        host.connect();
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
