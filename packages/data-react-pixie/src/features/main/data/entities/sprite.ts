// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Database } from "@adobe/data/ecs";
import type { components } from "../components/index.js";

// A sprite: plain readonly data with no id (identity is the entity key).
export const Sprite = ["position", "rotation", "kind", "hovered", "active"] as const satisfies Database.EntityComponents<typeof components>;
export type Sprite = Database.EntityType<typeof components, typeof Sprite>;
