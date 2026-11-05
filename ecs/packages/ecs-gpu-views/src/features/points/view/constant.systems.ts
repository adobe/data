// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { System } from '@adobe/ecs';
import { Frame } from '@adobe/ecs-gpu';
import { aim } from './systems/aim.js';
import { draw } from './systems/draw.js';

/** Every frame: the cameras aimed, then every view drawn and the surfaces presented. */
export const systems: readonly System[] = [aim, Frame.systems, draw];
