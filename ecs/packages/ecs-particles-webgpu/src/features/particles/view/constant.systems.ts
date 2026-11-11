// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { System } from '@adobe/ecs';
import { Frame } from '@adobe/ecs-gpu';
import { draw } from './systems/system.draw.js';

/**
 * A frame of the GPU's work, which the app runs: the views' and surfaces' updates, drawing the particles into every
 * view, and presenting. The app adds `Frame.releases`, which release what the updates make.
 */
export const systems: readonly System[] = [Frame.update, draw, Frame.present];
