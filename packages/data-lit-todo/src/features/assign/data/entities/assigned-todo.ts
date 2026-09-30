// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Database } from "@adobe/data/ecs";
import type { components } from "../components/index.js";

// A todo seen through this feature: main's todo plus its assignee names.
export const AssignedTodo = ["name", "complete", "order", "assignees"] as const satisfies Database.EntityComponents<typeof components>;
export type AssignedTodo = Database.EntityType<typeof components, typeof AssignedTodo>;
