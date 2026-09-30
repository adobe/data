// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "@adobe/data/ecs";
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { toggleComplete } from "./toggle-complete.js";

// Inert, spec-owned cases for `toggleComplete` — data only: no live service double,
// no test-framework runtime import (the `Conformance` binding is `import type`). The
// `analytics` double is synthesized by the runner from the manifest's `services`
// template; this file states only the calls to expect (`effects`). `before` is a
// delta over `State.create()`; `after` lists the written entities by plain spec-id.
// The `args` schema marks `id` as an entity reference so the ecs side resolves the
// spec-id to its seeded entity. Only the addressed todo's `complete` flips; an
// unknown id is a no-op; the toggle is logged unconditionally.
export const cases: Conformance.SpecCases<State, typeof toggleComplete> = {
  args: { type: "object", properties: { id: Entity.schema } },
  cases: [
    {
      name: "marks an incomplete todo complete",
      before: {
        entities: new Map([
          [1, { name: "a", complete: false, order: 0 }],
          [2, { name: "b", complete: false, order: 1 }],
        ]),
      },
      args: { id: 1 },
      after: {
        entities: new Map([
          [1, { name: "a", complete: true, order: 0 }],
          [2, { name: "b", complete: false, order: 1 }],
        ]),
      },
      effects: { analytics: [["todoToggled"]] },
    },
    {
      name: "marks a complete todo incomplete",
      before: {
        entities: new Map([
          [1, { name: "a", complete: true, order: 0 }],
          [2, { name: "b", complete: false, order: 1 }],
        ]),
        displayCompleted: true,
      },
      args: { id: 1 },
      after: {
        entities: new Map([
          [1, { name: "a", complete: false, order: 0 }],
          [2, { name: "b", complete: false, order: 1 }],
        ]),
      },
      effects: { analytics: [["todoToggled"]] },
    },
    {
      name: "is a no-op for an unknown id but still logs the toggle",
      before: {
        entities: new Map([[1, { name: "a", complete: false, order: 0 }]]),
      },
      args: { id: 99 },
      after: {
        entities: new Map([[1, { name: "a", complete: false, order: 0 }]]),
      },
      effects: { analytics: [["todoToggled"]] },
    },
  ],
};
