// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Todo } from "../todo/todo.js";
import type { Derivation } from "./conformance-case.js";
// The todos the user should see, in display order (ascending `order`): all of them
// when `displayCompleted`, otherwise only the incomplete ones. Yields id-less
// values — identity is the `entities` key, so the visible list compares by content.
export const visibleTodos = (
  state: Pick<State, "entities" | "displayCompleted">,
): readonly Todo[] =>
  [...state.entities.values()]
    .filter((todo) => state.displayCompleted || !todo.complete)
    .sort((a, b) => a.order - b.order);

// Spec-owned cases, shared with the ecs `visibleTodos` computed (an entity-id-list
// computed the runner hydrates through `toData` into these id-less values). A
// derivation case is `{ input, value }`; `input` is keyed by PLAIN spec-ids;
// `value` is id-less content in significant display order.
export const cases: Derivation<typeof visibleTodos> = [
  {
    name: "hides completed todos unless the completed view is on",
    input: {
      entities: new Map([
        [1, { name: "a", complete: false, order: 0 }],
        [2, { name: "b", complete: true, order: 1 }],
        [3, { name: "c", complete: false, order: 2 }],
      ]),
      displayCompleted: false,
    },
    value: [
      { name: "a", complete: false, order: 0 },
      { name: "c", complete: false, order: 2 },
    ],
  },
  {
    name: "shows every todo when the completed view is on",
    input: {
      entities: new Map([
        [1, { name: "a", complete: false, order: 0 }],
        [2, { name: "b", complete: true, order: 1 }],
      ]),
      displayCompleted: true,
    },
    value: [
      { name: "a", complete: false, order: 0 },
      { name: "b", complete: true, order: 1 },
    ],
  },
];
