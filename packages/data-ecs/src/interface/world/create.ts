import type { Instance } from '../platform/platform.js';
import type { Resource } from '../resource/resource.js';
import type { WorldWritten } from '../resource/written.js';
import type { Thread } from '../thread/thread.js';
import type { World } from './world.js';

/** Values resources start at in place of their defaults: any but those only the world writes. */
export type InitialResources = { readonly [K in Exclude<Resource.Name, WorldWritten>]?: Resource.Value<K> };

/**
 * Creates a world on this thread, synchronously, with resources starting at the given values in place of their
 * defaults. This thread is its `"world"` thread for the world's life: it runs the sync points, the ticks and the GPU
 * device, and fills every logical thread no joined thread claims. Throws for a key that isn't a resource, or is one
 * only the world writes.
 */
export type Create = (resources?: InitialResources) => World;

/** What a joined thread reaches the world through: a port to its thread, or, in a worker, the worker's own scope. */
export type Port = Instance<"MessagePort"> | Instance<"DedicatedWorkerGlobalScope">;

/**
 * Joins, from another thread, the world a port reaches, after importing the modules whose systems, observers and
 * finalizers run here, and fills `threads` for it. The joined world's `run` and `observe` work as on the world's thread;
 * its `dispose` disconnects this thread.
 */
export type Join = (port: Port, options?: { readonly threads?: readonly Thread[] }) => World;
