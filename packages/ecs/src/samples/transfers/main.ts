import { System, World } from '../../index.js';
import { attachSurface, stats } from './sprites.js';

/**
 * The transfers sample's page. The world runs on a worker, drawing into the canvas this thread moves to it; a loader
 * worker decodes textures and moves each to the world's thread; this thread, where the DOM is, joins the world and
 * shows what it draws.
 */

const overlay = (text: string): void => {
    const element = document.querySelector("#stats");
    if (element !== null) element.textContent = text;
};

let latest = { sprites: 0, frames: 0 };
// Added on this thread, it runs here after each of the world's frames that changed stats.
const show = System.create({ name: "transferSprites/show", observer: true, resources: { read: [stats], changed: [stats] } }, ({ resources }) => {
    const { sprites, frames } = resources[stats];
    latest = { sprites, frames };
    overlay(`${sprites} sprites, each a texture the loader decoded and moved to the world's worker · frame ${frames}`);
});

const start = async (): Promise<void> => {
    const canvas = document.querySelector("canvas");
    if (canvas === null) return;
    if (typeof canvas.transferControlToOffscreen !== "function") return overlay("This browser can't draw into a canvas from a worker.");
    canvas.width = Math.floor(canvas.clientWidth * devicePixelRatio);
    canvas.height = Math.floor(canvas.clientHeight * devicePixelRatio);
    const world = new Worker(new URL("./world.ts", import.meta.url), { type: "module" });
    const loader = new Worker(new URL("./loader.ts", import.meta.url), { type: "module" });
    const forMain = new MessageChannel();
    const forLoader = new MessageChannel();
    world.postMessage({ ports: [forMain.port1, forLoader.port1] }, [forMain.port1, forLoader.port1]);
    loader.postMessage({ port: forLoader.port2 }, [forLoader.port2]);
    const joined = World.join(forMain.port2);
    // Moved to the world's thread in the run's input: the canvas is drawn there from now on.
    await joined.run(attachSurface, { canvas: canvas.transferControlToOffscreen() });
    joined.add(show);
    /** For automated checks. */
    Reflect.set(globalThis, "sampleStats", async () => {
        await joined.run(show);
        return latest;
    });
};

void start();
