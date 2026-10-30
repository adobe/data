// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, World, gpuDevice } from '@adobe/ecs';
import { Device, Frame, Surface, Target } from '@adobe/ecs-gpu';
import { draw, enabled, move, moveOnCpu, position, spawn, spawnView, visible } from './particles.js';

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
    const device = await Device.request();
    if (device === null) return overlay("This browser has no WebGPU.");
    const canvas = document.querySelector("canvas");
    if (canvas === null) return;
    const width = Math.floor(canvas.clientWidth * devicePixelRatio);
    const height = Math.floor(canvas.clientHeight * devicePixelRatio);

    const moving = mode === "gpu" ? [move] : mode === "cpu" ? [moveOnCpu] : [];
    const world = World.create({ [gpuDevice]: device });
    const target = { ...Target.Options.default, depthFormat: null };
    const surface = await world.run(Surface.attach, { canvas: canvas.transferControlToOffscreen(), width, height, target });
    Surface.observe(canvas, world, surface);
    await world.run(spawnView, { surface });
    const frame = System.create({ systems: [...moving, Frame.systems, draw] });
    await world.run(spawn, { count, width, height });
    /** For automated checks: a few drawn particles' positions, which an observer system reads back from the GPU. */
    const probed: (readonly number[])[] = [];
    const probe = System.create({ readonly: true, components: { with: [position, visible, enabled] } }, row => {
        if (probed.length < 3) probed.push(row[position]);
    });
    Reflect.set(globalThis, "sampleProbe", async () => {
        probed.length = 0;
        await world.run(probe);
        return [...probed];
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
