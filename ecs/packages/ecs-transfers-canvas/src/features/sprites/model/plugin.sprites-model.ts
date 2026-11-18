// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from '@adobe/ecs';
import { move } from './system.move.js';

/** On the world's thread, every frame: the sprites move. */
export const spritesModel: Plugin = {
    systems: [move],
};
