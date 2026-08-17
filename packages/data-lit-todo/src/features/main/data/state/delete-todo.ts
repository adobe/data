// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "@adobe/data/ecs";
import { AnalyticsService } from "../../services/analytics-service/analytics-service.js";
import type { Services } from "../../services/services.js";
import type { State } from "./state.js";
import type { Todo } from "../todo/todo.js";
import { Conformance } from "./conformance-case.js";

// Reads the entities, writes the entities — an `{ entities }` patch — dropping the
// addressed id; also logs `todoDeleted`. Surviving todos keep their `order` (the
// ecs `deleteTodo` does not renumber either).
export const deleteTodo = (
  state: Pick<State, "entities">,
  {
    id,
    analytics,
  }: { readonly id: number } & Pick<Services, "analytics">,
): Pick<State, "entities"> => {
  analytics.todoDeleted();
  const entities = new Map(state.entities);
  entities.delete(id);
  return { entities };
};

const three: readonly (readonly [number, Todo])[] = [
  [1, { name: "a", complete: false, order: 0 }],
  [2, { name: "b", complete: true, order: 1 }],
  [3, { name: "c", complete: false, order: 2 }],
];

// Spec-owned cases, shared with the ecs `deleteTodo` transaction. `before` is a
// delta over `State.create()` keyed by PLAIN spec-ids (so `2` resolves via
// the seed map); `after` lists the surviving entities with plain spec-id
// keys. The addressed todo is removed; an unknown id is a no-op. The transition
// logs `todoDeleted`.
export const cases = Conformance.cases(deleteTodo, { args: { type: "object", properties: { id: Entity.schema } } },
  {
    name: "removes a middle todo",
    before: { entities: new Map(three) },
    args: { id: 2, analytics: AnalyticsService.createFake() },
    after: {
      entities: new Map([
        [1, { name: "a", complete: false, order: 0 }],
        [2, { name: "c", complete: false, order: 2 }],
      ]),
    },
    effects: { analytics: [["todoDeleted"]] },
  },
  {
    name: "removes the first todo",
    before: { entities: new Map(three), displayCompleted: true },
    args: { id: 1, analytics: AnalyticsService.createFake() },
    after: {
      entities: new Map([
        [1, { name: "b", complete: true, order: 1 }],
        [2, { name: "c", complete: false, order: 2 }],
      ]),
    },
    effects: { analytics: [["todoDeleted"]] },
  },
  {
    name: "is a no-op for an unknown id but still logs the delete",
    before: { entities: new Map(three) },
    args: { id: 99, analytics: AnalyticsService.createFake() },
    after: {
      entities: new Map([
        [1, { name: "a", complete: false, order: 0 }],
        [2, { name: "b", complete: true, order: 1 }],
        [3, { name: "c", complete: false, order: 2 }],
      ]),
    },
    effects: { analytics: [["todoDeleted"]] },
  },
);
