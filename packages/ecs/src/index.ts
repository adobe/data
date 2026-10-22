// © 2026 Adobe. MIT License. See /LICENSE for details.
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
export const World: { readonly create: Create; readonly join: Join } = { create, join };
