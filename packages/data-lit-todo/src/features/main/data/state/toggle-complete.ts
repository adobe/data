// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "@adobe/data/ecs";
import { AnalyticsService } from "../../services/analytics-service/analytics-service.js";
import type { Services } from "../../services/services.js";
import type { State } from "./state.js";
import type { Todo } from "../todo/todo.js";
import { Conformance } from "./conformance-case.js";

// Reads the entities, writes the entities — an `{ entities }` patch — flipping the
// addressed todo's `complete`; also logs `todoToggled`.
export const toggleComplete = (
  state: Pick<State, "entities">,
  {
    id,
    analytics,
  }: { readonly id: number } & Pick<Services, "analytics">,
): Pick<State, "entities"> => {
  analytics.todoToggled();
  const target = state.entities.get(id);
  if (target === undefined) return { entities: state.entities };
  return {
    entities: new Map(state.entities).set(id, {
      ...target,
      complete: !target.complete,
    }),
  };
};

const two: readonly (readonly [number, Todo])[] = [
  [1, { name: "a", complete: false, order: 0 }],
  [2, { name: "b", complete: false, order: 1 }],
];

// Spec-owned cases, shared with the ecs `toggleComplete` transaction. `before` is
// a delta over `State.create()` keyed by PLAIN spec-ids; `after` lists the written
// entities with plain spec-id keys. Only the addressed todo's `complete`
// flips; an unknown id is a no-op. The transition logs `todoToggled`
// unconditionally (as the action does).
export const cases = Conformance.cases(toggleComplete, { args: { type: "object", properties: { id: Entity.schema }, required: ["id"] } },
  {
    name: "marks an incomplete todo complete",
    before: { entities: new Map(two) },
    args: { id: 1, analytics: AnalyticsService.createFake() },
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
    args: { id: 1, analytics: AnalyticsService.createFake() },
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
    args: { id: 99, analytics: AnalyticsService.createFake() },
    after: {
      entities: new Map([
        [1, { name: "a", complete: false, order: 0 }],
      ]),
    },
    effects: { analytics: [["todoToggled"]] },
  },
);
