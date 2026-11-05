// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from '@adobe/ecs';
import { move, position, stats, surface, texture } from '../../model/index.js';

/** Clears the canvas, once a frame. */
export const clear = System.create({}, ({ resources }) => {
    const canvas = resources[surface];
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    resources[stats] = { sprites: resources[stats].sprites, frames: resources[stats].frames + 1 };
});

/** Draws each sprite's texture where it is. */
export const draw = System.create({ components: { with: [texture, position] }, after: [clear, move] }, (row, { resources }) => {
    const [x, y] = row[position];
    resources[surface]?.getContext("2d")?.drawImage(row[texture], x, y);
});
