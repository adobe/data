import { Component, Resource, System, Vec2, clock } from '../../index.js';

// The transfers sample's keys and systems, which every thread imports: the world, on a worker, draws sprites into the
// canvas main moved to it, each with a texture a loader worker decoded and moved to it. Values move through runs whose
// input holds them; an input field's schema `{ allOf: [] }` takes any value, typed `unknown`, which bodies narrow.

export const texture = Symbol("transferSprites/texture");
export const position = Symbol("transferSprites/position");
export const velocity = Symbol("transferSprites/velocity");
export const surface = Symbol("transferSprites/surface");
export const stats = Symbol("transferSprites/stats");

declare module '@adobe/data-ecs' {
    interface Components {
        [texture]: typeof textureTraits;
        [position]: typeof positionTraits;
        [velocity]: typeof velocityTraits;
    }
    interface Resources {
        [surface]: typeof surfaceTraits;
        [stats]: typeof statsTraits;
    }
}

/** A decoded texture, moved to the world's thread, where sprites are drawn. */
const textureTraits = Component.register(texture, { type: Component.object<ImageBitmap>(), transfer: true });
/** In pixels, and pixels per second. */
const positionTraits = Component.register(position, { type: Vec2.schema });
const velocityTraits = Component.register(velocity, { type: Vec2.schema });
/** The canvas main moved to the world's thread. */
const surfaceTraits = Resource.register(surface, { type: Resource.object<OffscreenCanvas | null>(), transfer: true });
const statsTraits = Resource.register(stats, {
    type: { type: "object", properties: { sprites: { type: "integer" }, frames: { type: "integer" } }, default: { sprites: 0, frames: 0 } },
});

const any = { allOf: [] } as const;

/** From main: the canvas the world draws into. */
export const attachSurface = System.create({ name: "transferSprites/attachSurface", input: { type: "object", properties: { canvas: any } }, resources: { write: [surface] } }, ({ input, resources }) => {
    if (typeof OffscreenCanvas === "function" && input.canvas instanceof OffscreenCanvas) resources[surface] = input.canvas;
});

/** A deterministic number in [0, 1) for each seed. */
const random = (seed: number): number => {
    const value = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
    return (Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0) / 2 ** 32;
};

/** From the loader: a sprite with the texture it decoded, somewhere on the canvas, moving. */
export const addSprite = System.create({
    name: "transferSprites/addSprite", input: { type: "object", properties: { bitmap: any, seed: { type: "integer" } } }, resources: { read: [surface], write: [stats] },
}, ({ input, resources, commands }) => {
    const canvas = resources[surface];
    if (canvas === null || typeof ImageBitmap !== "function" || !(input.bitmap instanceof ImageBitmap)) return;
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
const clear = System.create({ name: "transferSprites/clear", resources: { read: [surface], write: [stats] } }, ({ resources }) => {
    const canvas = resources[surface];
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    resources[stats] = { sprites: resources[stats].sprites, frames: resources[stats].frames + 1 };
});

/** Moves each sprite, bouncing off the canvas's edges. */
const move = System.create({
    name: "transferSprites/move", components: { read: [texture], write: [position, velocity] }, resources: { read: [surface, clock] },
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
const draw = System.create({ name: "transferSprites/draw", components: { read: [texture, position] }, resources: { read: [surface] }, after: [clear, move] }, (row, { resources }) => {
    const [x, y] = row[position];
    resources[surface]?.getContext("2d")?.drawImage(row[texture], x, y);
});

/** Every frame on the world's thread. */
export const frame = System.create({ name: "transferSprites/frame", systems: [clear, move, draw] });
