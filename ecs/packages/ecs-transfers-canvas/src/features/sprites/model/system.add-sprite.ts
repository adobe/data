// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from '@adobe/ecs';
import { position } from './component.position.js';
import { texture } from './component.texture.js';
import { stats } from './resource.stats.js';
import { surface } from './resource.surface.js';
import { velocity } from './shared/velocity.js';

/** From the loader: a sprite with the texture it decoded, moved in the run's input, somewhere on the canvas, moving. */
export const addSprite: System<{ readonly bitmap: ImageBitmap; readonly seed: number }> = System.create({}, ({ resources, commands }, input: { readonly bitmap: ImageBitmap; readonly seed: number }) => {
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

/** A deterministic number in [0, 1) for each seed. */
const random = (seed: number): number => {
    const value = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
    return (Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0) / 2 ** 32;
};
