// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { System } from "@adobe/ecs";
import { restoreSystem } from "./internal/function.restore-system.js";

/** Returns the voxels and selection to the state before the last change, which `redo` brings back. */
export const undo: System = restoreSystem(true);
