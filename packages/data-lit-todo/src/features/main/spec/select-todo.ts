// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { State } from "./state.js";

// Point the `selectedTodo` reference at an existing todo. A no-op (selection
// unchanged) for an id that names no todo — so selection never dangles.
export const selectTodo = (
  state: Pick<State, "entities" | "selectedTodo">,
  { id }: { id: Entity },
): Pick<State, "selectedTodo"> =>
  state.entities.has(id) ? { selectedTodo: id } : { selectedTodo: state.selectedTodo };
