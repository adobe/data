// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Database } from "@adobe/data/ecs";
import type { components } from "../components/index.js";

// One mark placed on the board: which mark, and which cell it occupies.
export const PlacedMark = ["mark", "cellIndex"] as const satisfies Database.EntityComponents<typeof components>;
export type PlacedMark = Database.EntityType<typeof components, typeof PlacedMark>;
