// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Database } from "@adobe/data/ecs";
import type { components } from "../components/index.js";

// A moving obstacle on one lane: plain data with no id (identity is the entity key).
// A session entity: never saved, never shared.
export const Hazard = ["nonPersistent", "nonShared", "kind", "lane", "x", "width", "velocity"] as const satisfies Database.EntityComponents<typeof components>;
export type Hazard = Database.EntityType<typeof components, typeof Hazard>;
