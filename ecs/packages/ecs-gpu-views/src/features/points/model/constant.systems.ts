// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { System } from '@adobe/ecs';
import { countFrames } from './systems/system.count-frames.js';
import { turn } from './system.turn.js';

/** Every frame: the points turn, and the frame is counted. */
export const systems: readonly System[] = [turn, countFrames];
