// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { System } from '@adobe/ecs';
import { Frame } from '@adobe/ecs-gpu';
import { draw } from './systems/system.draw.js';

/** A frame of the GPU's work: the views' and surfaces' updates, drawing the particles into every view, and presenting. */
export const systems: readonly System[] = [Frame.systems, draw];
