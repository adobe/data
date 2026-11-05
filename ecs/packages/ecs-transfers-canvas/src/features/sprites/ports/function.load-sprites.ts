// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { World } from '@adobe/ecs';
import { addSprite } from '../model/index.js';

/**
 * Makes one texture every 120 ms, 48 in all, as it would decode images it fetched: it draws a numbered disc of its
 * own hue, encodes it as a PNG and decodes it, then moves the bitmap to the world's thread in the run that adds its
 * sprite.
 */
export const loadSprites = async (world: World): Promise<void> => {
    for (let index = 0; index < count; index++) {
        const bitmap = await createImageBitmap(await encoded(index));
        // Moved, not copied: `bitmap` is detached here once the run is posted.
        await world.run(addSprite, { bitmap, seed: index * 4 });
        await new Promise(resolve => setTimeout(resolve, interval));
    }
};

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
