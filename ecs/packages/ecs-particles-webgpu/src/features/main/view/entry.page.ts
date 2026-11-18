// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Plugin, System, World, gpuDevice } from '@adobe/ecs';
import { Device, Surface, Target } from '@adobe/ecs-gpu';
import { enabled, move, moveOnCpu, position, spawn, visible } from '../../particles/model/index.js';
import { drawFrame, particlesView, spawnView } from '../../particles/view/index.js';

/*
 * Starts the particles sample on the page that loads it. `?mode=gpu` moves particles on the GPU, `cpu` on workers (uploading
 * positions for drawing each frame), and `static` only draws. `?count=` sets how many to spawn; a quarter are visible
 * and enabled.
 */
const parameters = new URLSearchParams(location.search);
const mode = modeOf(parameters.get("mode"));
const count = Number(parameters.get("count") ?? 1_000_000);
const stats = createStats(mode, count);
// For automated measurement.
Reflect.set(globalThis, "sampleStats", stats.read);

async function start(): Promise<void> {
    const device = await Device.request();
    if (device === null) return overlay("This browser has no WebGPU.");
    const canvas = document.querySelector("canvas");
    if (canvas === null) return;
    const width = Math.floor(canvas.clientWidth * devicePixelRatio);
    const height = Math.floor(canvas.clientHeight * devicePixelRatio);

    const world = World.create({ [gpuDevice]: device });
    Plugin.start(world, [particlesView]);
    const target = { ...Target.Options.default, depthFormat: null };
    const surface = await world.run(Surface.attach, { canvas: canvas.transferControlToOffscreen(), width, height, target });
    Surface.observe(canvas, world, surface);
    await world.run(spawnView, { surface });
    // The mode picks the move a frame runs, or none, so the moves are alternatives rather than one plugin's systems.
    const frames: Record<Mode, System> = {
        gpu: System.create({ systems: [move, drawFrame] }),
        cpu: System.create({ systems: [moveOnCpu, drawFrame] }),
        static: drawFrame,
    };
    const frame = frames[mode];
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
        stats.interval(now - last);
        last = now;
        if (inFlight.length >= 2) await inFlight.shift();
        const begin = performance.now();
        await world.run(frame);
        stats.run(performance.now() - begin);
        inFlight.push(device.queue.onSubmittedWorkDone());
        if (now - shown > 500) {
            shown = now;
            const { runMedian, runP95, intervalMedian } = stats.read();
            overlay(`${mode}: ${(count / 4).toLocaleString()} of ${count.toLocaleString()} particles drawn · run ${runMedian.toFixed(3)} ms (p95 ${runP95.toFixed(3)}) · ${(1000 / intervalMedian).toFixed(0)} fps`);
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

void start();

/** How a frame moves the particles: on the GPU, on the world's workers, or not at all. */
type Mode = "gpu" | "cpu" | "static";

/** The mode a `?mode=` value names, `gpu` when it names none. */
function modeOf(value: string | null): Mode {
    const modes: readonly Mode[] = ["gpu", "cpu", "static"];
    return modes.find(candidate => candidate === value) ?? "gpu";
}

/** Records the last frames' run times and intervals, in milliseconds, and reads their summary. */
function createStats(mode: Mode, count: number) {
    const runs: number[] = [];
    const intervals: number[] = [];
    const push = (values: number[], value: number): void => {
        values.push(value);
        if (values.length > kept()) values.shift();
    };
    return {
        run: (ms: number): void => push(runs, ms),
        interval: (ms: number): void => push(intervals, ms),
        read: () => ({
            mode,
            count,
            frames: runs.length,
            runMedian: percentile(runs, 0.5),
            runP95: percentile(runs, 0.95),
            intervalMedian: percentile(intervals, 0.5),
        }),
    };
}

/** How many of the last frames' times are kept. */
function kept(): number {
    return 600;
}

function percentile(values: readonly number[], fraction: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length === 0 ? NaN : sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
}

/** Shows `text` in the page's overlay. */
function overlay(text: string): void {
    const element = document.querySelector("#stats");
    if (element !== null) element.textContent = text;
}
