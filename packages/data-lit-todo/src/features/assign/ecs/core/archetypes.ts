// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { components } from "../../data/components/index.js";
import { User } from "../../data/entities/user.js";
import { AssignedTodo } from "../../data/entities/assigned-todo.js";

// `AssignedTodo` packs a todo that carries assignees (with main's tag),
// so conformance can seed one directly; at runtime a todo migrates into it on first assign.
export const archetypes = Database.archetypes(components, {
  User,
  AssignedTodo: ["todo", ...AssignedTodo],
});
