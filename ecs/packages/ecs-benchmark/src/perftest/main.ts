// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { availableParallelism, cpus } from "node:os";
import { scenarios } from "./constant.scenarios.js";
import { laneWorld } from "./function.lane-world.js";
import type { Lane } from "./type.lane.js";

/**
 * Runs one of the suite's benchmarks on one lane at one count of entities and prints its result as a line
 * `scripts/ours.mjs` reads: `node dist/perftest/main.js <lane> <name> <count>`, or `--names` for the benchmarks.
 * The pool has a worker for every hardware thread but the world's.
 */
const run = async (): Promise<void> => {
    const [first, name, countText] = process.argv.slice(2);
    if (first === "--names") {
        for (const scenario of scenarios) console.log(scenario.name);
        return;
    }
    const lane = first === "js" || first === "wasm" || first === "threads" ? first : null;
    const scenario = scenarios.find(candidate => candidate.name === name);
    const count = Number(countText);
    if (lane === null || scenario === undefined || !Number.isInteger(count) || count < 0) throw new Error("usage: main.js <js|wasm|threads> <name> <count>");
    // Shared memory is what WASM kernels and workers need; a page without cross-origin isolation runs kernels in JS.
    if (lane === "js") Object.defineProperty(globalThis, "crossOriginIsolated", { value: false, configurable: true });
    const threads = availableParallelism() - 1;
    const { times } = await scenario.measure(() => laneWorld(lane satisfies Lane, threads), count);
    const median = times.length % 2 === 1 ? times[(times.length - 1) / 2] ?? 0 : ((times[times.length / 2 - 1] ?? 0) + (times[times.length / 2] ?? 0)) / 2;
    const mean = times.reduce((sum, time) => sum + time, 0) / times.length;
    console.log(`ecs-benchmark-result ${JSON.stringify({
        name: `${scenario.name}/${count}`, lane, threads: lane === "threads" ? threads : 0, entities: count, iterations: times.length,
        median, mean, minimum: times[0], maximum: times[times.length - 1], cpu: cpus()[0]?.model ?? "unknown", node: process.versions.node,
    })}`);
};

run().then(() => process.exit(0), (error: unknown) => {
    console.error(error);
    process.exit(1);
});
