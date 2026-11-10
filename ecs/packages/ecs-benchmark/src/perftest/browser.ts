// © 2026 Adobe. MIT License. See /LICENSE for details.
import { scenarios } from "./constant.scenarios.js";
import { compareLanes } from "./function.compare-lanes.js";
import { laneWorld } from "./function.lane-world.js";

/**
 * Runs one of the suite's benchmarks in the page, as `main.ts` does in node, and prints its result as a line
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
