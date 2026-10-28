// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * A high-performance, multithreaded Entity Component System.
 * @module @adobe/ecs
 */
import { create, join } from './implementation/index.js';
import type { Create } from './interface/world/create.js';
import type { Join } from './interface/world/join.js';
import type { World as Created } from './interface/world/world.js';

export * from './interface/index.js';

/** A world: what systems read and change. */
export type World = Created;

/**
 * How a world is made, `World.create(resources?)`, on the thread that will run it, with resources starting at the given
 * values in place of their defaults; and how another thread joins one that shared itself with it,
 * `World.join(port, { threads })`.
 */
export const World: {
    /**
     * Creates a world on this thread, synchronously, with resources starting at the given values in place of their
     * defaults. This thread is its `"world"` thread for the world's life: it runs the sync points, the ticks and the GPU
     * device, and fills every logical thread no joined thread claims. Keys are the resources' symbols, built-in ones
     * included (`{ [workers]: 0 }`); string keys are never a resource's, so they're ignored. Throws for a symbol that isn't
     * a resource, or is one only the world writes. While a declaration's trait or default doesn't hold, each call fails to
     * compile, once, naming each such key, its members and what's wrong with them.
     */
    readonly create: Create;
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
    readonly join: Join;
} = { create, join };
