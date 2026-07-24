// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { F32 } from "@adobe/data/math";
import { Schema } from "@adobe/data/schema";
import { HazardKind } from "../../data/hazard-kind/hazard-kind.js";

// The row a hazard occupies — a small non-negative integer index.
const laneRow = { type: "integer", minimum: 0 } as const satisfies Schema;

// The columns that store the moving pieces. `x`/`y` are continuous world
// coordinates (F32) shared by the frog and the hazards; `kind`/`lane`/`width`/
// `velocity` describe a hazard. Scope is `session` — this is a purely local
// arcade run: nothing is persisted or shared. Entity kind is read from
// components, never inferred from membership (the frog has `y`, hazards don't).
export const components = Database.components({
  session: {
    x: F32.schema,
    y: F32.schema,
    kind: HazardKind.schema,
    lane: laneRow,
    width: F32.schema,
    velocity: F32.schema,
  },
});
