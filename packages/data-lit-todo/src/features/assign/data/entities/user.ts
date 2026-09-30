// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Database } from "@adobe/data/ecs";
import type { components } from "../components/index.js";

export const User = ["user", "name"] as const satisfies Database.EntityComponents<typeof components>;
export type User = Database.EntityType<typeof components, typeof User>;
