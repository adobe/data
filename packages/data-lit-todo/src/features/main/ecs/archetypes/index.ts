// © 2026 Adobe. MIT License. See /LICENSE for details.
// ECS archetypes — named component sets.
import * as components from "../components/index.js";

export const Todo = [
  "todo",
  "name",
  "complete",
  "order",
  "dragPosition",
  "assignees",
] as const satisfies ReadonlyArray<keyof typeof components>;
