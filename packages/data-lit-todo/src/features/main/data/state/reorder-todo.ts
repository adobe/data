// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "@adobe/data/ecs";
import type { State } from "./state.js";
import type { Todo } from "../todo/todo.js";
import { Conformance } from "./conformance-case.js";
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

const three: readonly (readonly [number, Todo])[] = [
  [1, { name: "a", complete: false, order: 0 }],
  [2, { name: "b", complete: false, order: 1 }],
  [3, { name: "c", complete: false, order: 2 }],
];
// Spec-owned cases, shared with the ecs `dragTodo` transaction (its final drop is
// the same move — `finalIndex` is `toIndex`, followed by `normalizeOrder`).
// `before` is a delta over `State.create()` keyed by PLAIN spec-ids; `after` lists
// the entities with plain spec-id keys and their RECOMPUTED contiguous
// `order`. Every case keeps all todos incomplete with `displayCompleted` true, so
// the visible list `dragTodo` indexes equals the full list. The unknown-id no-op is
// exercised only by the pure transform — `dragTodo` has no such guard.
export const cases = Conformance.cases(reorderTodo, { args: { type: "object", properties: { id: Entity.schema } } },
  {
    name: "moves the first todo to the end",
    before: { entities: new Map(three), displayCompleted: true },
    args: { id: 1, toIndex: 2 },
    after: {
      entities: new Map([
        [1, { name: "b", complete: false, order: 0 }],
        [2, { name: "c", complete: false, order: 1 }],
        [3, { name: "a", complete: false, order: 2 }],
      ]),
    },
  },
  {
    name: "moves the last todo to the front",
    before: { entities: new Map(three), displayCompleted: true },
    args: { id: 3, toIndex: 0 },
    after: {
      entities: new Map([
        [1, { name: "c", complete: false, order: 0 }],
        [2, { name: "a", complete: false, order: 1 }],
        [3, { name: "b", complete: false, order: 2 }],
      ]),
    },
  },
  {
    name: "clamps an out-of-range index to the end",
    before: { entities: new Map(three), displayCompleted: true },
    args: { id: 1, toIndex: 99 },
    after: {
      entities: new Map([
        [1, { name: "b", complete: false, order: 0 }],
        [2, { name: "c", complete: false, order: 1 }],
        [3, { name: "a", complete: false, order: 2 }],
      ]),
    },
  },
  {
    name: "keeps the order when moving to the same index",
    before: { entities: new Map(three), displayCompleted: true },
    args: { id: 2, toIndex: 1 },
    after: {
      entities: new Map([
        [1, { name: "a", complete: false, order: 0 }],
        [2, { name: "b", complete: false, order: 1 }],
        [3, { name: "c", complete: false, order: 2 }],
      ]),
    },
  },
);
