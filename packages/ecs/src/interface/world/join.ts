import type { Thread } from '../thread/thread.js';
import type { World } from './world.js';

/**
 * Joins, from another thread, a world that `share` let join through the other end of `port`, claiming the logical
 * `threads` this thread fills: their objects live here, and the systems and finalizers reading them run here. The world
 * it returns is the same one: its `run` runs systems there, and its `add` and `remove` take observer systems, which run
 * here after the world's sync points. Its `dispose` disconnects this thread.
 */
export type Join = (port: Parameters<World["share"]>[0], options?: { readonly threads?: readonly Exclude<Thread, "world">[] }) => World;
