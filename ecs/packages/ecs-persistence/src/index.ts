// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * Saving, loading and copying the entities of `@adobe/ecs` worlds: snapshots of the components and resources a trait of
 * the application's own covers, as binary columns.
 * @module @adobe/ecs-persistence
 */
export { decode } from "./decode.js";
export { encode } from "./encode.js";
export type { Failure } from "./failure.js";
export { snapshot, type Snapshot } from "./snapshot.js";
export { spawn, type Spawned } from "./spawn.js";
