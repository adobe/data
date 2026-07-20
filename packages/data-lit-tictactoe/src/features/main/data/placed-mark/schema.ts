// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";
import { PlayerMark } from "../player-mark/player-mark.js";
import { CellIndex } from "../cell-index/cell-index.js";

// One mark placed on the board: which mark, and which cell it occupies. This is
// the shape of a PlacedMark entity's row — the archetype is checked against it
// (see ecs/archetypes).
export const schema = Schema.fromObjectProperties(
  { mark: PlayerMark.schema, index: CellIndex.schema },
  ["mark", "index"],
);
