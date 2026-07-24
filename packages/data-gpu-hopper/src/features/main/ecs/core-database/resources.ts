// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { Schema } from "@adobe/data/schema";
import { GameStatus } from "../../data/game-status/game-status.js";
import { Direction } from "../../data/direction/direction.js";
import { Lane } from "../../data/lane/lane.js";

// Board dimensions and the run's scalar state. Each carries the default the
// resource facet requires.
const width = { type: "integer", minimum: 1, default: 9 } as const satisfies Schema;
const height = { type: "integer", minimum: 1, default: 9 } as const satisfies Schema;
const lives = { type: "integer", minimum: 0, default: 3 } as const satisfies Schema;
const score = { type: "integer", minimum: 0, default: 0 } as const satisfies Schema;

// The static terrain layout: one Lane per row, referenced by identity so it
// stays the single source of truth for the row type.
const lanes = { type: "array", items: Lane.schema, default: [] } as const satisfies Schema;

// Loop plumbing with no `data/` `State` analogue (the projection ignores both).
// `frameDelta` is the per-frame dt the render loop feeds the step systems;
// `pendingDirection` is the queued hop the input system consumes and clears.
const frameDelta = { type: "number", default: 1 / 60 } as const satisfies Schema;
const pendingDirection = {
  oneOf: [Direction.schema, { type: "null" }],
  default: null,
} as const satisfies Schema;

export const resources = Database.resources({
  session: {
    width,
    height,
    lives,
    score,
    status: GameStatus.schema,
    lanes,
    frameDelta,
    pendingDirection,
  },
});
