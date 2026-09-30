// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { visibleTodos } from "./visible-todos.js";

// Inert derivation cases for `visibleTodos` — `{ input, value }` pairs. Shared with
// the ecs `visibleTodos` computed (an entity-id-list the runner hydrates through
// `toData` into these id-less values). `input` is keyed by plain spec-ids; `value`
// is id-less content in significant display order.
export const cases: Conformance.SpecDerivations<typeof visibleTodos> = {
  cases: [
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
  ],
};
