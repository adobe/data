// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";

export const selectVisible = (input: {
  readonly displayCompleted: boolean;
  readonly allTodos: readonly Entity[];
  readonly incompleteTodos: readonly Entity[];
}): readonly Entity[] =>
  input.displayCompleted ? input.allTodos : input.incompleteTodos;
