// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "@adobe/data/ecs";
import type { State } from "./state.js";
import { Conformance } from "./conformance-case.js";

// Point the `selectedTodo` reference at an existing todo. A no-op (selection
// unchanged) for an id that names no todo — so selection never dangles.
export const selectTodo = (
  state: Pick<State, "entities" | "selectedTodo">,
  { id }: { id: Entity },
): Pick<State, "selectedTodo"> =>
  state.entities.has(id) ? { selectedTodo: id } : { selectedTodo: state.selectedTodo };

const three = new Map([
  [1, { name: "a", complete: false, order: 0 }],
  [2, { name: "b", complete: false, order: 1 }],
  [3, { name: "c", complete: false, order: 2 }],
]);

// Spec-owned cases, shared with the ecs `selectTodo` transaction. The `args` schema
// marks `id` as an entity reference (`Entity.schema`), so the runner resolves the
// plain spec-id to the seeded entity on the ecs side. `after` writes `selectedTodo`
// as the PLAIN spec-id of the referenced todo; conformance compares
// it to the ecs (which mints its own ids) up to an id-bijection, so the reference
// lines up with the same entity's map key on both sides with no author bookkeeping.
export const cases = /*@__PURE__*/ Conformance.cases(selectTodo, { args: { type: "object", properties: { id: Entity.schema } } },
  {
    name: "selects an existing todo",
    before: { entities: three },
    args: { id: 2 },
    after: { selectedTodo: 2 },
  },
  {
    name: "leaves the selection unchanged for an id that names no todo",
    before: { entities: three, selectedTodo: 1 },
    args: { id: 99 },
    after: { selectedTodo: 1 },
  },
);
