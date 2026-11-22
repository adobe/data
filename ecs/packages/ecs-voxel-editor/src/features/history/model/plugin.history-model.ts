// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from "@adobe/ecs";
import { recordHistory } from "./plugin.history-model/system.record-history.js";

/** Records the voxels' and selection's changes as they happen, on the tick after each, for `undo` and `redo`. */
export const historyModel: Plugin = {
    systems: [recordHistory],
};
