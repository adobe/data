// © 2026 Adobe. MIT License. See /LICENSE for details.
import { clock, System, type U32, Vec2 } from '../../index.js';

// The transfers sample's keys and systems, which every thread imports: the world, on a worker, draws sprites into the
// canvas main moved to it, each with a texture a loader worker decoded and moved to it. Values move through runs whose
// input holds them.

export const texture = Symbol();
export const position = Symbol();
export const velocity = Symbol();
export const surface = Symbol();
export const stats = Symbol();

declare module '@adobe/ecs' {
    interface Components {
        [texture]: { type: ImageBitmap; transfer: true };
        [position]: { type: Vec2 };
        [velocity]: { type: Vec2 };
    }
    interface Resources {
        [surface]: { type: OffscreenCanvas | null; transfer: true };
        [stats]: { type: { readonly sprites: U32; readonly frames: U32 }; default: { sprites: 0; frames: 0 } };
    }
}

/** A decoded texture, moved to the world's thread, where sprites are drawn. */
/** In pixels, and pixels per second. */
/** The canvas main moved to the world's thread. */

/** From main: the canvas the world draws into. */
export const attachSurface = System.create({ resources: { write: [surface] } }, ({ resources }, input: { readonly canvas: OffscreenCanvas }) => {
    resources[surface] = input.canvas;
});

/** A deterministic number in [0, 1) for each seed. */
const random = (seed: number): number => {
    const value = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
    return (Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0) / 2 ** 32;
};

/** From the loader: a sprite with the texture it decoded, somewhere on the canvas, moving. */
export const addSprite = System.create({
    resources: { read: [surface], write: [stats] },
}, ({ resources, commands }, input: { readonly bitmap: ImageBitmap; readonly seed: number }) => {
    const canvas = resources[surface];
    if (canvas === null) return;
    const angle = random(input.seed) * Math.PI * 2;
    const speed = 60 + random(input.seed + 1) * 120;
    commands.spawn([texture, position, velocity])({
        [texture]: input.bitmap,
        [position]: [random(input.seed + 2) * (canvas.width - input.bitmap.width), random(input.seed + 3) * (canvas.height - input.bitmap.height)],
        [velocity]: [Math.cos(angle) * speed, Math.sin(angle) * speed],
    });
    resources[stats] = { sprites: resources[stats].sprites + 1, frames: resources[stats].frames };
});

/** Clears the canvas, once a frame. */
const clear = System.create({ resources: { read: [surface], write: [stats] } }, ({ resources }) => {
    const canvas = resources[surface];
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    resources[stats] = { sprites: resources[stats].sprites, frames: resources[stats].frames + 1 };
});

/** Moves each sprite, bouncing off the canvas's edges. */
const move = System.create({
    components: { read: [texture], write: [position, velocity] }, resources: { read: [surface, clock] },
}, (row, { resources }) => {
    const canvas = resources[surface];
    if (canvas === null) return;
    const seconds = resources[clock].delta / 1000;
    const [x, y] = row[position];
    let [dx, dy] = row[velocity];
    const right = canvas.width - row[texture].width;
    const bottom = canvas.height - row[texture].height;
    if ((x <= 0 && dx < 0) || (x >= right && dx > 0)) dx = -dx;
    if ((y <= 0 && dy < 0) || (y >= bottom && dy > 0)) dy = -dy;
    row[velocity] = [dx, dy];
    row[position] = [Math.min(Math.max(x + dx * seconds, 0), right), Math.min(Math.max(y + dy * seconds, 0), bottom)];
});

/** Draws each sprite's texture where it is. */
const draw = System.create({ components: { read: [texture, position] }, resources: { read: [surface] }, after: [clear, move] }, (row, { resources }) => {
    const [x, y] = row[position];
    resources[surface]?.getContext("2d")?.drawImage(row[texture], x, y);
});

/** Every frame on the world's thread. */
export const frame = System.create({ systems: [clear, move, draw] });
