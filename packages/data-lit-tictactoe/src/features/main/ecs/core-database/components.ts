// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { CellIndex } from "../../data/cell-index/cell-index.js";
import { PlayerMark } from "../../data/player-mark/player-mark.js";

export const components = Database.components({
  document: {
    mark: PlayerMark.schema,
    index: CellIndex.schema,
  },
});
