// © 2026 Adobe. MIT License. See /LICENSE for details.
import { clock, System } from '@adobe/ecs';
import { position } from './component.position.js';
import { texture } from './component.texture.js';
import { surface } from './resource.surface.js';
import { velocity } from './shared/component.velocity.js';

/** Moves each sprite, bouncing off the canvas's edges. */
export const move: System = System.create({
    components: { with: [texture, position, velocity] },
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
