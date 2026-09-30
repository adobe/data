// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Database } from "@adobe/data/ecs";
import type { components } from "../components/index.js";

// A todo: plain readonly data with no id (identity is the entity key).
export const Todo = ["name", "complete", "order"] as const satisfies Database.EntityComponents<typeof components>;
export type Todo = Database.EntityType<typeof components, typeof Todo>;
