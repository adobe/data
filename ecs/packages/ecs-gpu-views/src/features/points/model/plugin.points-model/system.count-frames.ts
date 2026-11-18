// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from '@adobe/ecs';
import { frames } from '../resource.frames.js';

/** Counts frames, for the page's overlay. */
export const countFrames: System = System.create({}, ({ resources }) => { resources[frames] = resources[frames] + 1; });
