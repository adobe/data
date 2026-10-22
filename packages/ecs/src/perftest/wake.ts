// © 2026 Adobe. MIT License. See /LICENSE for details.
import { createMemory } from "../implementation/world/memory.js";
import { createPool, type FastTask } from "../implementation/world/pool.js";
import { idleKernel } from "../implementation/world/protocol.js";
import { platformWorkers } from "../implementation/world/worker-platform.js";
import type { Benchmark } from "./benchmark.js";

/** Round trips in each timed stretch of `wake`. */
export const wakes = 10_000;

const idle: FastTask = { kernel: idleKernel, archetype: -1, start: 0, end: 0, tick: 0, lastRun: 0, scalars: [], partials: -1, partialBytes: 0 };

/** The fastest of `stretches` stretches of `wakes` round trips to one pool worker waiting in its window, after one to warm up. */
const wakeRoundTrips = async (stretches = 5): Promise<number> => {
    const platform = platformWorkers();
    const port = platform?.start() ?? null;
    if (port === null) throw new Error("This platform has no workers.");
    const pool = createPool([port], createMemory(true));
    let best = Infinity;
    try {
        for (let stretch = 0; stretch <= stretches; stretch++) {
            const start = performance.now();
            for (let k = 0; k < wakes; k++) await pool.claimed(0, 1, idle, 1)[0];
            if (stretch > 0) best = Math.min(best, performance.now() - start);
        }
    }
    finally {
        await pool.terminate();
    }
    return best;
};

export const wake: Benchmark = {
    name: "wake",
    operation: "A task posted to a pool worker waiting in its window, which wakes, marks it done and wakes the world's thread: the fixed cost of every tier on workers.",
    per: "round trips",
    n: wakes,
    typical: [1, 100],
    best: { bytes: 128, basis: "A round trip moves at least the two cache lines of the ring's posted and done words between cores." },
    run: () => wakeRoundTrips(),
};
