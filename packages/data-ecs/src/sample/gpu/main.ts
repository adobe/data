import { Gpu } from '../../gpu/gpu.js';
import { System } from '../../system/system.js';
import { World } from '../../world/world.js';
import { createDraw, enabled, move, moveOnCpu, position, spawn, visible } from './particles.js';

/**
 * The particles sample. `?mode=gpu` moves particles on the GPU, `cpu` on workers (uploading positions for drawing
 * each frame), and `static` only draws. `?count=` sets how many to spawn; a quarter are visible and enabled.
 */
type Mode = "gpu" | "cpu" | "static";
const modes: readonly Mode[] = ["gpu", "cpu", "static"];

const parameters = new URLSearchParams(location.search);
const mode = modes.find(candidate => candidate === parameters.get("mode")) ?? "gpu";
const count = Number(parameters.get("count") ?? 1_000_000);

/** Run times and frame intervals of the last frames, in milliseconds. */
const kept = 600;
const runs: number[] = [];
const intervals: number[] = [];
const percentile = (values: readonly number[], fraction: number): number => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length === 0 ? NaN : sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
};
const push = (values: number[], value: number): void => {
    values.push(value);
    if (values.length > kept) values.shift();
};

/** For automated measurement. */
const stats = () => ({
    mode,
    count,
    frames: runs.length,
    runMedian: percentile(runs, 0.5),
    runP95: percentile(runs, 0.95),
    intervalMedian: percentile(intervals, 0.5),
});
Reflect.set(globalThis, "sampleStats", stats);

const overlay = (text: string): void => {
    const element = document.querySelector("#stats");
    if (element !== null) element.textContent = text;
};

const start = async (): Promise<void> => {
    const adapter = await navigator.gpu?.requestAdapter();
    if (adapter === null || adapter === undefined) return overlay("This browser has no WebGPU.");
    const device = await adapter.requestDevice();
    const canvas = document.querySelector("canvas");
    if (canvas === null) return;
    canvas.width = Math.floor(canvas.clientWidth * devicePixelRatio);
    canvas.height = Math.floor(canvas.clientHeight * devicePixelRatio);
    const context = canvas.getContext("webgpu");
    if (context === null) return overlay("No WebGPU canvas context.");
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "opaque" });

    const moving = mode === "gpu" ? [move] : mode === "cpu" ? [moveOnCpu] : [];
    const world = World.create({ gpuDevice: device });
    const { draw, ready } = createDraw(device, Gpu.layout(device), context, format);
    await ready;
    const frame = System.composite({ name: "gpuParticles/frame", systems: [...moving, draw] });
    await world.run(spawn, { count, width: canvas.width, height: canvas.height });
    /** For automated checks: a few drawn particles' positions, brought back from the GPU. */
    Reflect.set(globalThis, "sampleProbe", async () => {
        await world.synchronize([position]);
        return world.query.select([position, visible, enabled]).slice(0, 3).map(entity => world.read.component(entity, position));
    });

    // At most two frames of GPU work in flight, so the CPU can't run ahead of the GPU.
    const inFlight: Promise<undefined>[] = [];
    let last = performance.now();
    let shown = 0;
    const tick = async (now: number): Promise<void> => {
        push(intervals, now - last);
        last = now;
        if (inFlight.length >= 2) await inFlight.shift();
        const begin = performance.now();
        await world.run(frame);
        push(runs, performance.now() - begin);
        inFlight.push(device.queue.onSubmittedWorkDone());
        if (now - shown > 500) {
            shown = now;
            const { runMedian, runP95, intervalMedian } = stats();
            overlay(`${mode}: ${(count / 4).toLocaleString()} of ${count.toLocaleString()} particles drawn · run ${runMedian.toFixed(3)} ms (p95 ${runP95.toFixed(3)}) · ${(1000 / intervalMedian).toFixed(0)} fps`);
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
};

void start();
