import { it } from "vitest";
import { gpuDevice } from "../interface/resources/gpu-device.js";
import { createWorld } from "../implementation/world/create.js";
import { calibrationSource, copyBandwidth, environmentLine, resultLine, threadsBandwidth, type Benchmark, type Curve } from "./benchmark.js";
import { gpuForest, place } from "./hierarchy.js";
import { workers } from "../interface/resources/workers.js";
import { loopTickIdle, loopTicks } from "./loop.js";
import { main, placed, pooled, threads, upOperation } from "./placed.js";
import { wake } from "./wake.js";
import { remoteBenchmarks } from "./remote.js";
import { logBenchmarks } from "./log.js";
import { handoffBenchmarks } from "./handoff.js";
import { finalizedBenchmarks } from "./finalized.js";
import { tailBenchmarks } from "./tails.js";
import { transferBenchmarks } from "./transfers.js";
import { indexBenchmarks } from "./indexes.js";
import { observedGpuBenchmarks } from "./observed-gpu.js";

/** Every worker's copy bandwidth together, through browser workers running the calibration script. */
const browserThreadsBandwidth = async (): Promise<Curve> => {
    const url = URL.createObjectURL(new Blob([calibrationSource], { type: "text/javascript" }));
    try {
        return await threadsBandwidth(threads, () => {
            const worker = new Worker(url);
            return {
                ask: message => new Promise(resolve => {
                    worker.onmessage = resolve;
                    worker.postMessage(message);
                }),
                terminate: () => worker.terminate(),
            };
        });
    }
    finally {
        URL.revokeObjectURL(url);
    }
};

const requestDevice = async (): Promise<GPUDevice> => {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter === null) throw new Error("No WebGPU adapter.");
    return adapter.requestDevice();
};

/** Bytes per nanosecond the GPU copies between buffers, read and written. */
const gpuBandwidth = async (device: GPUDevice): Promise<number> => {
    const bytes = 1 << 27;
    const from = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_SRC });
    const to = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST });
    const copies = 10;
    let best = Infinity;
    for (let i = 0; i < 6; i++) {
        const encoder = device.createCommandEncoder();
        for (let k = 0; k < copies; k++) encoder.copyBufferToBuffer(from, 0, to, 0, bytes);
        const start = performance.now();
        device.queue.submit([encoder.finish()]);
        await device.queue.onSubmittedWorkDone();
        best = Math.min(best, performance.now() - start);
    }
    from.destroy();
    to.destroy();
    return (2 * bytes * copies) / (best * 1e6);
};

/** Milliseconds per run on the GPU: runs submitted back to back, timed until the GPU finishes them. */
const gpuFastest = async (device: GPUDevice, run: () => Promise<unknown>, batch = 20): Promise<number> => {
    for (let i = 0; i < batch; i++) await run();
    await device.queue.onSubmittedWorkDone();
    let best = Infinity;
    for (let round = 0; round < 10; round++) {
        const start = performance.now();
        for (let i = 0; i < batch; i++) await run();
        await device.queue.onSubmittedWorkDone();
        best = Math.min(best, (performance.now() - start) / batch);
    }
    return best;
};

const benchmarks = (device: GPUDevice): readonly Benchmark[] => [
    ...placed([main, pooled]),
    ...indexBenchmarks.filter(benchmark => benchmark.name.endsWith(" workers")),
    wake,
    {
        name: "loop tick idle",
        operation: "A world's loop ticking with nothing changed, driven back to back with `always` set, counted by a synced system reading its clock: the fixed cost of every tick.",
        per: "ticks",
        n: loopTicks,
        typical: [1, 1],
        best: { bytes: 64, basis: "A run reads at least one cache line of its system's state." },
        run: () => loopTickIdle(),
    },
    ...remoteBenchmarks,
    ...logBenchmarks,
    ...handoffBenchmarks,
    ...finalizedBenchmarks,
    ...tailBenchmarks,
    ...transferBenchmarks,
    ...observedGpuBenchmarks(device, run => gpuFastest(device, run)),
    ...[[100_000, 10, "100K chains of 10"], [1_000, 1_000, "1K chains of 1,000"]].map(([roots, depth, chains]): Benchmark => ({
        name: `up depth ${depth} gpu`,
        operation: upOperation(String(chains)),
        per: "rows",
        n: 1_000_000,
        typical: [1_000, 100_000],
        best: { bytes: 16, basis: "Each row reads its 4-byte value, its parent's 4-byte result and 4-byte row, and writes its 4-byte result.", on: "gpu" },
        run: async () => {
            const world = createWorld({ [workers]: 0, [gpuDevice]: device });
            try {
                await world.run(gpuForest, { roots: Number(roots), depth: Number(depth) });
                return await gpuFastest(device, () => world.run(place));
            } finally {
                await world.dispose();
            }
        },
    })),
];

it("runs the browser benchmarks", async () => {
    const device = await requestDevice();
    console.log(environmentLine(navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0].replace("/", " ") ?? navigator.userAgent, {
        thread: copyBandwidth(),
        threads: await browserThreadsBandwidth(),
        gpu: await gpuBandwidth(device),
    }));
    for (const benchmark of benchmarks(device)) console.log(resultLine(benchmark, await benchmark.run()));
    device.destroy();
}, 600_000);
