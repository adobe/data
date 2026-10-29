// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, World } from '@adobe/ecs';
import { Surface, Target } from '@adobe/ecs-gpu';
import { frames, spawnPoints, spawnViews } from './scene.js';

/**
 * The views sample's page. The world runs on a worker and draws into both canvases, which this thread moves to it; this
 * thread keeps each canvas's size there as it changes on the page, and shows how many frames it drew.
 */

const overlay = (text: string): void => {
    const element = document.querySelector("#stats");
    if (element !== null) element.textContent = text;
};

let drawn = 0;
/** Whether the world on the worker has shut down, after the page said it was leaving. */
let left = false;
// Added on this thread, it runs here after each of the world's frames.
const show = System.create({ readonly: true, resources: { changed: [frames] } }, ({ resources }) => {
    drawn = resources[frames];
    overlay(`frame ${drawn} · drawn on the world's worker into two canvases: two views side by side, and one from above`);
});

const start = async (): Promise<void> => {
    const main = document.querySelector<HTMLCanvasElement>("#main");
    const map = document.querySelector<HTMLCanvasElement>("#map");
    if (main === null || map === null) return;
    if ((await navigator.gpu?.requestAdapter()) === null || navigator.gpu === undefined) return overlay("This browser has no WebGPU.");
    if (!crossOriginIsolated) return overlay("This sample's threads share memory, which needs cross-origin isolation, and this host doesn't provide it.");
    const worker = new Worker(new URL("./world.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", event => { if (typeof event.data === "object" && event.data !== null && Reflect.get(event.data, "left") === true) left = true; });
    const channel = new MessageChannel();
    worker.postMessage({ port: channel.port1 }, [channel.port1]);
    const world = await World.join(channel.port2);
    const stops: (() => void)[] = [];
    let leaving: Promise<void> | null = null;
    /** Shuts the world on the worker down, resolving once it says it destroyed its device and disposed itself. */
    const leave = (): Promise<void> => leaving ??= new Promise(resolve => {
        for (const stop of stops) stop();
        worker.addEventListener("message", event => { if (typeof event.data === "object" && event.data !== null && Reflect.get(event.data, "left") === true) resolve(); });
        worker.postMessage({ leave: true });
        void world.dispose();
    });
    // A sample browser showing this page asks it to leave before it shows another, and waits for the answer.
    addEventListener("message", event => {
        if (event.source !== parent || event.origin !== location.origin || typeof event.data !== "object" || event.data === null || Reflect.get(event.data, "kind") !== "ecs-sample-leave") return;
        void leave().then(() => parent.postMessage({ kind: "ecs-sample-left" }, location.origin));
    });
    if (parent !== window) parent.postMessage({ kind: "ecs-sample-leaves" }, location.origin);
    // Leaving otherwise, as when the tab closes, it's asked to leave as the page goes.
    addEventListener("pagehide", () => void leave(), { once: true });
    const attach = async (canvas: HTMLCanvasElement, target: Target.Options) => {
        const width = canvas.clientWidth * devicePixelRatio;
        const height = canvas.clientHeight * devicePixelRatio;
        const surface = await world.run(Surface.attach, { canvas: canvas.transferControlToOffscreen(), width, height, target });
        stops.push(Surface.observe(canvas, world, surface));
        return surface;
    };
    const views = {
        main: await attach(main, { ...Target.Options.default, sampleCount: 4, clear: [0.02, 0.03, 0.08, 1] }),
        map: await attach(map, { ...Target.Options.default, clear: [0.08, 0.08, 0.08, 1] }),
    };
    await world.run(spawnViews, views);
    await world.run(spawnPoints, { count: 4096 });
    world.add(show);
    /** For automated checks. */
    Reflect.set(globalThis, "sampleStats", () => ({ frames: drawn, left }));
};

void start();
