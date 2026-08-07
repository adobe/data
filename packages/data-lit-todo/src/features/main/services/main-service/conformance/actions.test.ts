// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { Database, Entity } from "@adobe/data/ecs";
import type { ConformanceCase } from "../../../data/state/conformance-case.js";
import { splitAndRecordServices, expectEffects } from "../../../data/state/record-effects.js";
import type { AnalyticsService } from "../../analytics-service/analytics-service.js";
import type { NameGeneratorService } from "../../name-generator-service/name-generator-service.js";
import { FeatureDatabase } from "../feature-database.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";
import { expectStateMatches } from "../../../data/state/expect-state-matches.js";
import { createTodo } from "../action-database/actions/create-todo.js";
import { createBulkTodos } from "../action-database/actions/create-bulk-todos.js";
import { createRandomTodo } from "../action-database/actions/create-random-todo.js";
import { deleteTodo } from "../action-database/actions/delete-todo.js";
import { deleteAllTodos } from "../action-database/actions/delete-all-todos.js";
import { toggleComplete } from "../action-database/actions/toggle-complete.js";
import { toggleDisplayCompleted } from "../action-database/actions/toggle-display-completed.js";
import { cases as createTodoCases } from "../../../data/state/create-todo.js";
import { cases as createBulkTodosCases } from "../../../data/state/create-bulk-todos.js";
import { cases as createRandomTodoCases } from "../../../data/state/create-random-todo.js";
import { cases as deleteTodoCases } from "../../../data/state/delete-todo.js";
import { cases as deleteAllTodosCases } from "../../../data/state/delete-all-todos.js";
import { cases as toggleCompleteCases } from "../../../data/state/toggle-complete.js";
import { cases as toggleDisplayCompletedCases } from "../../../data/state/toggle-display-completed.js";

// Each transition's cases run against its same-named ecs **action** (the async
// realization). The case's service args become the db's service overrides —
// wrapped so their calls are recorded — the plain args drive the action, and we
// assert both the resulting state (ignoring ids) and the declared side effects.
// A transition realized only by a transaction (e.g. `reorderTodo`) is covered by
// `transactions.test.ts`, not here.
// `toSystemDatabase` exposes the writable `.store` the projection needs while
// keeping services/transactions/actions. Runtime invariant: the recording
// wrappers preserve each service's shape, so they are valid factory overrides.
const makeDb = (services: { analytics?: AnalyticsService; nameGenerator?: NameGeneratorService }) =>
  Database.toSystemDatabase(Database.create(FeatureDatabase.plugin, { services }));
type Db = ReturnType<typeof makeDb>;
type Run<Args> = (db: Db, input: Args, resolve: (specId: number) => Entity) => Promise<void> | void;

const covered = new Set<string>();
const conformsAction = <Args>(
  action: string,
  config: { readonly cases: readonly ConformanceCase<Args>[]; readonly run: Run<Partial<Args>> },
): void => {
  covered.add(action);
  describe(`${action} action conforms`, () => {
    for (const testCase of config.cases) {
      it(testCase.name, async () => {
        const { services, input, calls } = splitAndRecordServices(testCase.args);
        const db = makeDb(services as { analytics?: AnalyticsService; nameGenerator?: NameGeneratorService });
        const entities = fromState(db.store, testCase.before);
        const bySpecId = new Map(testCase.before.todos.map((todo, i) => [todo.id, entities[i]]));
        const resolve = (specId: number): Entity => bySpecId.get(specId) ?? Entity.none;
        await config.run(db, input as Partial<Args>, resolve);
        expectStateMatches(toState(db.store), testCase.after);
        expectEffects(calls, testCase.effects);
      });
    }
  });
};

conformsAction("createTodo", {
  cases: createTodoCases,
  run: (db, input) => createTodo(db, { name: input.name ?? "", complete: input.complete }),
});
conformsAction("createBulkTodos", {
  cases: createBulkTodosCases,
  run: (db, input) => createBulkTodos(db, { count: input.count ?? 0 }),
});
conformsAction("createRandomTodo", {
  cases: createRandomTodoCases,
  run: (db) => createRandomTodo(db),
});
conformsAction("deleteTodo", {
  cases: deleteTodoCases,
  run: (db, input, resolve) => deleteTodo(db, resolve(input.id ?? -1)),
});
conformsAction("deleteAllTodos", { cases: deleteAllTodosCases, run: (db) => deleteAllTodos(db) });
conformsAction("toggleComplete", {
  cases: toggleCompleteCases,
  run: (db, input, resolve) => toggleComplete(db, resolve(input.id ?? -1)),
});
conformsAction("toggleDisplayCompleted", {
  cases: toggleDisplayCompletedCases,
  run: (db) => toggleDisplayCompleted(db),
});

// None-missed guard: every action file must be wired above.
const kebabToCamel = (name: string): string =>
  name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
describe("action conformance coverage", () => {
  const files = import.meta.glob([
    "../action-database/actions/*.ts",
    "!../action-database/actions/index.ts",
  ]);
  for (const path of Object.keys(files)) {
    const action = kebabToCamel(path.replace(/.*\//, "").replace(/\.ts$/, ""));
    it(`${action} has a conformance case`, () => expect(covered.has(action)).toBe(true));
  }
});
