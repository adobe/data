// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from '@adobe/ecs';
import { stats, surface } from '../../model/index.js';

/** Clears the canvas, once a frame. */
export const clear: System = System.create({}, ({ resources }) => {
    const canvas = resources[surface];
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    resources[stats] = { sprites: resources[stats].sprites, frames: resources[stats].frames + 1 };
});
