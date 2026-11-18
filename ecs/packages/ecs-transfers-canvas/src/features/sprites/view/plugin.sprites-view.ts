// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from '@adobe/ecs';
import { clear } from './plugin.sprites-view/system.clear.js';
import { draw } from './plugin.sprites-view/system.draw.js';

/** On the world's thread, every frame: the canvas cleared, counting the frame, then each sprite drawn where it moved. */
export const spritesView: Plugin = {
    systems: [clear, draw],
};
