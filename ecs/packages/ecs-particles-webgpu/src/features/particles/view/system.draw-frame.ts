// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from '@adobe/ecs';
import { Frame } from '@adobe/ecs-gpu';
import { draw } from './system.draw-frame/system.draw.js';

/**
 * A frame of the GPU's work, which the app runs: the views' and surfaces' updates, drawing the particles into every
 * view after whichever move ran beside it, and presenting.
 */
export const drawFrame: System = System.create({ systems: [Frame.update, draw, Frame.present] });
