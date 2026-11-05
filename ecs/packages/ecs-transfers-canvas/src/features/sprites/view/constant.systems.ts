// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { System } from '@adobe/ecs';
import { clear } from './systems/system.clear.js';
import { draw } from './systems/system.draw.js';

/** Every frame on the world's thread: the canvas cleared and each sprite drawn where it moved. */
export const systems: readonly System[] = [clear, draw];
