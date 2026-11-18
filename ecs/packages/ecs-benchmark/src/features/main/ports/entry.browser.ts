// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { World } from "@adobe/ecs";
import { createGpuUpdateEntities, gpuComplexSystemsUpdate, readGpuState } from "../../gpu/model/index.js";
import { scenarios } from "./internal/constant.scenarios.js";
import { laneWorld } from "./internal/function.lane-world.js";

/**
 * By value the worlds hold, how many rows differ and the words of a row that differ in any; for f32 pairs, the largest
 * difference of a field.
 */
type LaneDifferences = { readonly [value: string]: { readonly rows: number; readonly differing: number; readonly words: readonly number[]; readonly largest?: number } };

/**
 * Runs `frames` of the 7-system GPU frame over `count` entities on the worlds, settling each, and compares what they
 * hold: each component's rows, and the frame buffer as a row.
 */
const compareLanes = async (worlds: readonly [World, World], count: number, frames: number, settle: () => Promise<void>): Promise<LaneDifferences> => {
    const state = async (world: World) => {
        await world.run(createGpuUpdateEntities, { count });
        for (let frame = 0; frame < frames; frame++) {
            await world.run(gpuComplexSystemsUpdate);
            await settle();
        }
        return world.run(readGpuState);
    };
    const [first, second] = await Promise.all([state(worlds[0]), state(worlds[1])]);
    const differences: { [value: string]: { rows: number; differing: number; words: number[]; largest?: number } } = {};
    for (const [name, { bytes, stride }] of Object.entries(first.components)) {
        const other = second.components[name]?.bytes ?? new Uint8Array(0);
        const rows = stride === 0 ? 0 : bytes.length / stride;
        let differing = 0;
        const words = new Set<number>();
        for (let row = 0; row < rows; row++) {
            let differs = false;
            for (let k = 0; k < stride; k++) {
                if (bytes[row * stride + k] === other[row * stride + k]) continue;
                differs = true;
                words.add(k >> 2);
            }
            if (differs) differing++;
        }
        const floats = name === "position" || name === "velocity";
        let largest = 0;
        if (floats) {
            const a = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
            const b = new Float32Array(other.buffer, other.byteOffset, other.length / 4);
            for (let k = 0; k < a.length; k++) largest = Math.max(largest, Math.abs((a[k] ?? 0) - (b[k] ?? 0)));
        }
        const differingWords = [...words].sort((a, b) => a - b);
        differences[name] = floats ? { rows, differing, words: differingWords, largest } : { rows, differing, words: differingWords };
    }
    const cells = Array.from(first.frame.keys()).filter(k => first.frame[k] !== second.frame[k]);
    differences["frame"] = { rows: 1, differing: cells.length === 0 ? 0 : 1, words: cells.slice(0, 8) };
    return differences;
};

/**
 * Runs one of the suite's benchmarks in the page, as `entry.node.ts` does in node, and prints its result as a line
 * `scripts/gpu.mjs` reads: `browser.html?lane=<wasm|gpu>&name=<benchmark>&count=<entities>`; or, with `compare`, runs
 * the GPU frames on the GPU and on the CPU and prints how what they hold differs.
 */
const run = async (): Promise<void> => {
    const search = new URLSearchParams(location.search);
    const adapter = await navigator.gpu?.requestAdapter({ powerPreference: "high-performance" });
    if (adapter === undefined || adapter === null) throw new Error("This browser has no WebGPU adapter.");
    // The default limits keep storage bindings to 128 MiB; the world's GPU heap holds every entity.
    const device = await adapter.requestDevice({ requiredLimits: { maxBufferSize: adapter.limits.maxBufferSize, maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize } });
    const settle = (): Promise<void> => device.queue.onSubmittedWorkDone();
    const count = Number(search.get("count"));
    const gpu = { vendor: adapter.info.vendor, architecture: adapter.info.architecture, fallback: adapter.info.isFallbackAdapter };
    if (search.has("compare")) {
        const differences = await compareLanes([laneWorld("gpu", 0, device), laneWorld("wasm", 0)], count, Number(search.get("frames") ?? 20), settle);
        console.log(`ecs-benchmark-compare ${JSON.stringify({ count, gpu, differences })}`);
        return;
    }
    const lane = search.get("lane") === "gpu" ? "gpu" : "wasm";
    const scenario = scenarios.find(candidate => candidate.name === search.get("name"));
    if (scenario === undefined || !Number.isInteger(count) || count < 0) throw new Error("usage: browser.html?lane=<wasm|gpu>&name=<benchmark>&count=<entities>");
    const { times } = await scenario.measure(() => laneWorld(lane, 0, device), count, lane === "gpu" ? settle : async () => {});
    const median = times.length % 2 === 1 ? times[(times.length - 1) / 2] ?? 0 : ((times[times.length / 2 - 1] ?? 0) + (times[times.length / 2] ?? 0)) / 2;
    const mean = times.reduce((sum, time) => sum + time, 0) / times.length;
    console.log(`ecs-benchmark-result ${JSON.stringify({
        name: `${scenario.name}/${count}`, lane, threads: 0, entities: count, iterations: times.length,
        median, mean, minimum: times[0], maximum: times[times.length - 1], gpu, browser: navigator.userAgent,
    })}`);
};


run().catch((error: unknown) => console.log(`ecs-benchmark-error ${error instanceof Error ? error.stack ?? error.message : String(error)}`));
