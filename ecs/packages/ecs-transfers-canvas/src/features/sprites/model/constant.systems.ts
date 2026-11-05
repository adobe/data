// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { System } from '@adobe/ecs';
import { move } from './system.move.js';

/** Every frame on the world's thread: the sprites move. */
export const systems: readonly System[] = [move];
