// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Resource } from '../resource/resource.js';
import type { WorldWritten } from '../resource/written.js';
import type { InvalidDeclarations } from './declarations.js';
import type { World } from './world.js';

/** Values resources start at in place of their defaults: any but those only the world writes. */
export type InitialResources = { readonly [K in Exclude<Resource.Key, WorldWritten>]?: Resource.Value<K> };

/**
 * Creates a world on this thread, synchronously, with resources starting at the given values in place of their
 * defaults. This thread is its `"world"` thread for the world's life: it runs the sync points, the ticks and the GPU
 * device, and fills every logical thread no joined thread claims. Keys are the resources' symbols, built-in ones
 * included (`{ [workers]: 0 }`); string keys are never a resource's, so they're ignored. Throws for a symbol that isn't
 * a resource, or is one only the world writes. While a declaration's trait or default doesn't hold, each call fails to
 * compile, once, naming each such key, its members and what's wrong with them.
 */
export type Create = (
    // Unknown while every declaration holds; else what a call's `this` can't be, so the call reports it, printed whole.
    this: [InvalidDeclarations] extends [never] ? unknown : { readonly "declarations don't hold": { readonly [D in InvalidDeclarations as D["key"]]: D["members"] } },
    resources?: InitialResources,
) => World;
