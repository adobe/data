// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { controlWords, done, epoch, posted, ringSize, taskWords } from "./protocol.js";
import { runWindow } from "./worker-window.js";

describe("a pool worker's window", () => {
    it("runs a task the pool posted just before closing it, after the worker last looked for tasks", () => {
        const control = new Int32Array(new SharedArrayBuffer(controlWords * 4));
        const statuses = new Int32Array(new SharedArrayBuffer(ringSize * 4));
        const payloads = new Float64Array(new SharedArrayBuffer(ringSize * taskWords * 8));
        const windowEpoch = 2;
        control[epoch] = windowEpoch;
        // The pool, between the worker's look at `posted` and its look at the epoch: it posts a task of this window,
        // then closes it.
        const load = Atomics.load;
        let lookedForTasks = false;
        let played = false;
        const playPool = (array: Int32Array, index: number): number => {
            const value = load(array, index);
            if (array !== control) return value;
            if (index === posted) lookedForTasks = true;
            else if (index === epoch && lookedForTasks && !played) {
                played = true;
                payloads[6] = windowEpoch;
                Atomics.store(control, posted, 1);
                return Atomics.add(control, epoch, 1) + 1;
            }
            return value;
        };
        const original = Object.getOwnPropertyDescriptor(Atomics, "load");
        let ran = 0;
        try {
            Object.defineProperty(Atomics, "load", { value: playPool, configurable: true, writable: true });
            runWindow(control, statuses, payloads, windowEpoch, () => { ran++; });
        }
        finally {
            if (original !== undefined) Object.defineProperty(Atomics, "load", original);
        }
        expect(played).toBe(true);
        expect(ran).toBe(1);
        expect(Atomics.load(control, done)).toBe(1);
    });
});
