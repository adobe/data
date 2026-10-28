// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Resource } from '../resource/resource.js';
import type { WorldWritten } from '../resource/written.js';
import type { InvalidDeclarations } from './declarations.js';
import type { World } from './world.js';

/** Values resources start at in place of their defaults: any but those only the world writes. */
export type InitialResources = { readonly [K in Exclude<Resource.Key, WorldWritten>]?: Resource<K> };

/**
 * The type of `World.create`.
 * @inline
 */
export type Create = (
    // Unknown while every declaration holds; else what a call's `this` can't be, so the call reports it, printed whole.
    this: [InvalidDeclarations] extends [never] ? unknown : { readonly "declarations don't hold": { readonly [D in InvalidDeclarations as D["key"]]: D["members"] } },
    resources?: InitialResources,
) => World;
