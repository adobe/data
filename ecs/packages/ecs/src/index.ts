// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * A high-performance, multithreaded Entity Component System.
 * @module @adobe/ecs
 */
import type { World as Created } from './interface/world/world.js';

export * from './interface/index.js';

/** A world: what systems read and change. */
export type World = Created;

/**
 * How a world is made, `World.create(resources?)`, on the thread that will run it, with resources starting at the given
 * values in place of their defaults; how another thread joins one that shared itself with it,
 * `World.join(port, { threads })`; and `World.Table`, an archetype's rows as a readonly system's `tables` copies them
 * and `commands.spawnTables` spawns them.
 */
export * as World from './world.js';
