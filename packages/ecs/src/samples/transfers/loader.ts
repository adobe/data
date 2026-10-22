// © 2026 Adobe. MIT License. See /LICENSE for details.
import { World } from '../../index.js';
import { addSprite } from './sprites.js';

// The loader, on a worker: it joins the world through the port main sends, then encodes textures as images and decodes
// them, as it would images it fetched, moving each decoded bitmap to the world's thread in the run that adds its sprite.

/** Textures loaded, one each `interval` milliseconds. */
const count = 48;
const interval = 120;

/** An encoded image: a disc of a hue of its own, numbered. */
const encoded = async (index: number): Promise<Blob> => {
    const canvas = new OffscreenCanvas(48, 48);
    const context = canvas.getContext("2d");
    if (context !== null) {
        context.fillStyle = `hsl(${(index * 47) % 360} 80% 60%)`;
        context.beginPath();
        context.arc(24, 24, 22, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#000";
        context.font = "bold 18px system-ui, sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(String(index + 1), 24, 25);
    }
    return canvas.convertToBlob({ type: "image/png" });
};

const load = async (port: MessagePort): Promise<void> => {
    const world = World.join(port);
    for (let index = 0; index < count; index++) {
        const bitmap = await createImageBitmap(await encoded(index));
        // Moved, not copied: `bitmap` is detached here once the run is posted.
        await world.run(addSprite, { bitmap, seed: index * 4 });
        await new Promise(resolve => setTimeout(resolve, interval));
    }
};

self.onmessage = (event: MessageEvent<unknown>) => {
    const port: unknown = typeof event.data === "object" && event.data !== null ? Reflect.get(event.data, "port") : null;
    if (port instanceof MessagePort) void load(port);
};
