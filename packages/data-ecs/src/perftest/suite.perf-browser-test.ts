import { it } from "vitest";
import { gpuDevice } from "../resources/gpu-device.js";
import type { World } from "../world/world.js";
import { createWorld } from "../world/create/create.js";
import { calibrationSizes, copyBandwidth, environmentLine, resultLine, type Benchmark, type Best, type Curve } from "./benchmark.js";
import { forest, gpuForest, place, propagate } from "./hierarchy.js";
import { fastest as particlesFastest, move, spawn } from "./particles.js";
import { chain, fastest, follow, observe, poke, seeded } from "./suite.js";

const threads = navigator.hardwareConcurrency - 1;

/**
 * Every worker's copy bandwidth together at each calibration size, each worker copying its share in buffers of its own,
 * since copies between shared buffers are slower than the kernels' loads and stores. Workers claim pieces from a shared
 * counter, as the ECS splits work, so the slowest core doesn't set the time.
 */
const threadsBandwidth = async (): Promise<Curve> => {
    // Every claim copies one piece of `size / pieces` bytes `copies` times, so a pass copies `size` bytes `copies` times.
    // A worker's buffers hold its share of `size`, at least one piece, and it copies its pieces in turn.
    const source = `onmessage = ({ data: [piece, share, counter, total, copies] }) => {
        const length = piece / 8, count = Math.max(1, Math.round(share / piece));
        const source = new Float64Array(length * count).fill(1), target = new Float64Array(length * count), claims = new Int32Array(counter);
        let next = 0;
        postMessage(0);
        onmessage = () => {
            for (let claim = Atomics.add(claims, 0, 1); claim < total; claim = Atomics.add(claims, 0, 1)) {
                const start = next * length, from = source.subarray(start, start + length);
                for (let k = 0; k < copies; k++) target.set(from, start);
                next = (next + 1) % count;
            }
            postMessage(0);
        };
    };`;
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const pieces = 64;
    const curve: [number, number][] = [];
    for (const size of calibrationSizes) {
        const workers = Array.from({ length: threads }, () => new Worker(url));
        const counter = new Int32Array(new SharedArrayBuffer(4));
        const copies = Math.max(1, Math.round((1 << 28) / size));
        const each = (message: unknown): Promise<unknown> => Promise.all(workers.map(worker => new Promise(resolve => {
            worker.onmessage = resolve;
            worker.postMessage(message);
        })));
        await each([size / pieces, size / threads, counter.buffer, pieces, copies]);
        let best = Infinity;
        for (let i = 0; i < 8; i++) {
            counter[0] = 0;
            const start = performance.now();
            await each(0);
            best = Math.min(best, (performance.now() - start) / copies);
        }
        for (const worker of workers) worker.terminate();
        curve.push([2 * size, (2 * size) / (best * 1e6)]);
    }
    URL.revokeObjectURL(url);
    return curve;
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

type Placement = { readonly label: string; readonly workers: number; readonly on?: Best["on"] };
const main: Placement = { label: "main", workers: 0 };
const workers: Placement = { label: "workers", workers: threads, on: "threads" };

/** A world of the placement, measured, then disposed. */
const measured = async (placement: Placement, run: (world: World) => Promise<number>): Promise<number> => {
    const world = createWorld({ workers: placement.workers });
    try {
        return await run(world);
    } finally {
        await world.dispose();
    }
};

const upOperation = (chains: string): string => `A kernel with \`up\` computing every row from its parent, over ${chains}: transforms, inherited visibility or style, recomputed in full.`;
const upBest = { bytes: 28, basis: "Each row reads its 8-byte value, its parent's 8-byte result and 4-byte row, and writes its 8-byte result." };

const benchmarks = (device: GPUDevice): readonly Benchmark[] => [
    ...[main, workers].flatMap((placement): readonly Benchmark[] => [
        {
            name: `move ${placement.label}`,
            operation: "A kernel adding a vec3 to another for the rows with two tags: integration, animation, any per-row update.",
            per: "matched rows",
            n: 250_000,
            typical: [1_000, 1_000_000],
            best: { bytes: 36, basis: "Each row reads 12 bytes of velocity and reads and writes 12 bytes of position.", on: placement.on },
            run: () => measured(placement, async world => {
                await world.run(spawn, { count: 1_000_000 });
                return (await particlesFastest(() => world.run(move))).minimum;
            }),
        },
        {
            name: `follow ${placement.label}`,
            operation: "A kernel looking up another entity per row and reading its position: steering toward targets, constraints, attachments.",
            per: "rows",
            n: 1_000_000,
            typical: [1_000, 100_000],
            best: { bytes: 52, basis: "Each row reads 12 bytes of position and an 8-byte target, the target's 8-byte location and 12-byte position, and writes 12.", on: placement.on },
            run: () => measured(placement, async world => {
                await seeded(() => world, 1_000_000);
                return fastest(() => world.run(follow));
            }),
        },
        {
            name: `chain ${placement.label}`,
            operation: "Six dependent kernels over the same rows, each reading what the one before wrote: a pipeline of per-row steps.",
            per: "row passes",
            n: 6_000_000,
            typical: [6_000, 6_000_000],
            best: { bytes: 4, basis: "Fused into one pass, each row reads and writes its 12-byte velocity once for all six.", on: placement.on },
            run: () => measured(placement, async world => {
                await seeded(() => world, 1_000_000);
                return fastest(() => world.run(chain));
            }),
        },
        {
            name: `sparse changed ${placement.label}`,
            operation: "A kernel filtered on `changed` after 1% of rows changed, scattered: reacting to edits, such as recomputing bounds of what moved.",
            per: "rows in the archetype",
            n: 1_000_000,
            typical: [10_000, 1_000_000],
            best: { bytes: 8.24, basis: "Every chunk has a change, so each row's 8-byte tick is read; the changed 1% read 12 bytes and write 12.", on: placement.on },
            run: () => measured(placement, async world => {
                await seeded(() => world, 1_000_000);
                let frame = 0;
                let best = Infinity;
                for (let i = 0; i < 60; i++) {
                    await world.run(poke, { group: frame++ % 100 });
                    const start = performance.now();
                    await world.run(observe);
                    if (i >= 10) best = Math.min(best, performance.now() - start);
                }
                return best;
            }),
        },
        ...[[100_000, 10, "100K chains of 10"], [1_000, 1_000, "1K chains of 1,000"]].map(([roots, depth, chains]): Benchmark => ({
            name: `up depth ${depth} ${placement.label}`,
            operation: upOperation(String(chains)),
            per: "rows",
            n: 1_000_000,
            typical: [1_000, 100_000],
            best: { ...upBest, on: placement.on },
            run: () => measured(placement, async world => {
                await world.run(forest, { roots: Number(roots), depth: Number(depth) });
                return fastest(() => world.run(propagate));
            }),
        })),
    ]),
    ...[[100_000, 10, "100K chains of 10"], [1_000, 1_000, "1K chains of 1,000"]].map(([roots, depth, chains]): Benchmark => ({
        name: `up depth ${depth} gpu`,
        operation: upOperation(String(chains)),
        per: "rows",
        n: 1_000_000,
        typical: [1_000, 100_000],
        best: { bytes: 16, basis: "Each row reads its 4-byte value, its parent's 4-byte result and 4-byte row, and writes its 4-byte result.", on: "gpu" },
        run: async () => {
            const world = createWorld({ workers: 0, resources: { [gpuDevice]: device } });
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
        threads: await threadsBandwidth(),
        gpu: await gpuBandwidth(device),
    }));
    for (const benchmark of benchmarks(device)) console.log(resultLine(benchmark, await benchmark.run()));
    device.destroy();
}, 600_000);
