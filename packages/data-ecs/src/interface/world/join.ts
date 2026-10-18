import type { Thread } from '../thread/thread.js';
import type { World } from './world.js';

/**
 * One end of a channel to another thread, of the browser or node: a `MessagePort`, a `Worker`, or a worker's own scope,
 * `self` or node's `parentPort`.
 */
export type Port = { readonly postMessage: (message: never, transfer: never) => void } & (
    | { readonly addEventListener: (type: "message", listener: (event: unknown) => void) => void }
    | { readonly on: (event: "message", listener: (value: unknown) => void) => unknown }
);

/** The logical threads a joining thread fills, the world's own aside; none by default. */
export type JoinOptions = { readonly threads?: readonly Exclude<Thread, "world">[] };

/**
 * Joins, through `port`, the world another thread shared through the other end, once this thread has imported the
 * modules of the systems it runs and the keys it observes. Runs and observers work as on the world's thread, by the
 * ids the build gives top-level systems and keys: a run of a system without one, or one the world never imported,
 * rejects. An observer's first value always comes later, and one that falls behind gets the newest value; observers
 * read structs only, and an entity's whole value is its struct components. `dispose` disconnects this thread. Throws
 * where memory can't be shared, as without cross-origin isolation.
 */
export type Join = (port: Port, options?: JoinOptions) => World;
