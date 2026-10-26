// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Thread } from '../thread/thread.js';
import type { World } from './world.js';

/**
 * Joins, from another thread, a world that `share` let join through the other end of `port`, claiming the logical
 * `threads` this thread fills: their objects live here, and the systems and finalizers reading them run here. Resolves,
 * once the world accepted the claim, to the same world: its `run` runs systems there, and its `add` and `remove` take
 * observer systems, which run here after the world's sync points. Add them before awaiting anything else, so the
 * world's `share` resolves with them in place. Its `dispose` disconnects this thread. Rejects with an `Error` saying
 * why it didn't join: the world refused the claim, was disposed, or its thread ended first, as the platform reports it:
 * the world's `Worker` failing to start or throwing first, a port closed, as in node, or, in a browser, the world's
 * thread ending once it was shared through a port this thread listened on. A browser world's worker that the page ended
 * before this thread heard from it isn't reported, so the join stays pending. Rejects too where memory can't be shared,
 * as without cross-origin isolation.
 */
export type Join = (port: Parameters<World["share"]>[0], options?: { readonly threads?: readonly Exclude<Thread, "world">[] }) => Promise<World>;
