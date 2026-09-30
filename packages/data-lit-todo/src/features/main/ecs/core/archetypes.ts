// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { components } from "../../data/components/index.js";
import { Todo } from "../../data/entities/todo.js";

// Archetype packing: the spec `Todo` entity plus the implementation-only `todo` tag.
// The session-scoped `dragPosition` is deliberately NOT packed in: it is stripped on
// load (no default), which would drop every reloaded todo out of this archetype. The
// drag transaction adds it on demand.
export const archetypes = Database.archetypes(components, {
  Todo: ["todo", ...Todo],
});
