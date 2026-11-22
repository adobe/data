// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { System } from "@adobe/ecs";
import { restoreSystem } from "./internal/function.restore-system.js";

/** Brings back the change `undo` last took away; a new change after an undo leaves nothing to redo. */
export const redo: System = restoreSystem(false);
