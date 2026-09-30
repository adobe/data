// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { components } from "../../data/components/index.js";
import { Todo } from "../../data/entities/todo.js";

// Archetype packing: the spec `Todo` entity plus the implementation-only `todo` tag
// and live `dragPosition` slot.
export const archetypes = Database.archetypes(components, {
  Todo: ["todo", ...Todo, "dragPosition"],
});
