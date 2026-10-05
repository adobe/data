// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
/**
 * Moves the todo with the given id to `toIndex` within the display order,
 * preserving the relative order of every other todo, then recomputes every
 * `order` to a contiguous 0,1,2,… sequence so the moved todo lands at the target
 * rank (mirroring the ecs `dragTodo` drop + `normalizeOrder`). Reads the entities,
 * writes the entities — an `{ entities }` patch. Out-of-range indices are clamped
 * and an unknown id is a no-op. A pure reorder — no side effects.
 */
export const reorderTodo = (
  state: Pick<State, "entities">,
  input: { readonly id: number; readonly toIndex: number },
): Pick<State, "entities"> => {
  if (!state.entities.has(input.id)) return { entities: state.entities };

  const ordered = [...state.entities].sort(
    ([, a], [, b]) => a.order - b.order,
  );
  const fromIndex = ordered.findIndex(([id]) => id === input.id);
  const [moved] = ordered.splice(fromIndex, 1);
  const toIndex = Math.max(0, Math.min(input.toIndex, ordered.length));
  ordered.splice(toIndex, 0, moved);

  return {
    entities: new Map(
      ordered.map(([id, todo], index) => [id, { ...todo, order: index }]),
    ),
  };
};
