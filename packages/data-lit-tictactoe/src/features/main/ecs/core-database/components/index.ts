// © 2026 Adobe. MIT License. See /LICENSE for details.
// ECS components — each binds a data-type schema into entity column storage.
import { PlayerMark } from "../../data/player-mark/player-mark.js";
import { CellIndex } from "../../data/cell-index/cell-index.js";

export const mark = PlayerMark.schema;
export const index = CellIndex.schema;
