// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, World } from '@adobe/ecs';
import { attachSurface, stats } from '../../sprites/model/index.js';

// The transfers sample's page, which index.html loads. The world runs on a worker, drawing into the canvas this thread
// moves to it; a loader worker decodes textures and moves each to the world's thread; this thread, where the DOM is,
// joins the world and shows what it draws.

const start = async (): Promise<void> => {
    const canvas = document.querySelector("canvas");
    const overlay = document.querySelector("#stats");
    const show = (text: string): void => { if (overlay !== null) overlay.textContent = text; };
    if (canvas === null) return;
    if (typeof canvas.transferControlToOffscreen !== "function") return show("This browser can't draw into a canvas from a worker.");
    if (!crossOriginIsolated) return show("This sample's threads share memory, which needs cross-origin isolation, and this host doesn't provide it.");
    canvas.width = Math.floor(canvas.clientWidth * devicePixelRatio);
    canvas.height = Math.floor(canvas.clientHeight * devicePixelRatio);
    const world = new Worker(new URL("./entry.world-worker.ts", import.meta.url), { type: "module" });
    const loader = new Worker(new URL("../ports/entry.loader-worker.ts", import.meta.url), { type: "module" });
    const forMain = new MessageChannel();
    const forLoader = new MessageChannel();
    world.postMessage({ ports: [forMain.port1, forLoader.port1] }, [forMain.port1, forLoader.port1]);
    loader.postMessage({ port: forLoader.port2 }, [forLoader.port2]);
    const joined = await World.join(forMain.port2);
    // Moved to the world's thread in the run's input: the canvas is drawn there from now on.
    await joined.run(attachSurface, { canvas: canvas.transferControlToOffscreen() });
    let latest = { sprites: 0, frames: 0 };
    // Added on this thread, it shows the counts after each of the world's frames that changed them.
    const showStats = System.create({ readonly: true, resources: { changed: [stats] } }, ({ resources }) => {
        const { sprites, frames } = resources[stats];
        latest = { sprites, frames };
        show(`${sprites} sprites, each a texture the loader decoded and moved to the world's worker · frame ${frames}`);
    });
    joined.add(showStats);
    // For automated checks.
    Reflect.set(globalThis, "sampleStats", async () => {
        await joined.run(showStats);
        return latest;
    });
};

void start();
