// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Thread } from '../thread/thread.js';
import type { World } from './world.js';

/**
 * The type of `World.join`.
 * @inline
 */
export type Join = (port: Parameters<World["share"]>[0], options?: { readonly threads?: readonly Exclude<Thread, "world">[] }) => Promise<World>;
