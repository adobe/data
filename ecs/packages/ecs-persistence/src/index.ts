// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * Saving, loading and copying the entities of `@adobe/ecs` worlds: snapshots of their persisted components and
 * resources, as binary columns.
 * @module @adobe/ecs-persistence
 */
export { decode } from "./decode.js";
export { encode } from "./encode.js";
export type { Failure } from "./failure.js";
export { persist } from "./persist.js";
export { snapshot, type Snapshot } from "./snapshot.js";
export { spawn, type Spawned } from "./spawn.js";
