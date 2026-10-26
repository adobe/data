// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Where a run's frame finds its runtime's exports (`runtime.ts`). */
export const runtimeKey = Symbol.for("ecs-guide/runtime");

/** The names the runtime gives besides the package's exports. */
export const runtimeNames: readonly string[] = ["attachKernel", "prepareLookup", "prepareAdd", "prepareSpawn", "start", "loopGuard", "callGuard"];
