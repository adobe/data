// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from '@adobe/ecs';
import { Frame } from '@adobe/ecs-gpu';
import { aim } from './plugin.points-view/system.aim.js';
import { draw } from './plugin.points-view/system.draw.js';

/** Every frame: the cameras aimed, then every view drawn into and the surfaces presented. */
export const pointsView: Plugin = { systems: [aim, Frame.systems, draw] };
