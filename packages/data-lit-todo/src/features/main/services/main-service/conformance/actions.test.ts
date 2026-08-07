// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { Conformance } from "@adobe/data/testing";
import type { AnalyticsService } from "../../analytics-service/analytics-service.js";
import type { NameGeneratorService } from "../../name-generator-service/name-generator-service.js";
import { MainService } from "../main-service.js";
import * as registeredActions from "../action-database/actions/index.js";
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
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// Each transition's cases run against its same-named ecs action. `runActions`
// splits the case's injected services into recording overrides (via `makeDb`),
// runs the action, then asserts both the resulting state and the declared effects;
// the harness/coverage are shared. A transition realized only by a transaction
// (e.g. `reorderTodo`) is covered by `transactions.test.ts`, not here.
Conformance.runActions({
  // `toSystemDatabase` exposes the writable `.store` the projection needs. Runtime
  // invariant: the recording wrappers preserve each service's shape, so they are
  // valid factory overrides.
  makeDb: (services) =>
    Database.toSystemDatabase(
      Database.create(MainService.plugin, {
        services: services as {
          analytics?: AnalyticsService;
          nameGenerator?: NameGeneratorService;
        },
      }),
    ),
  store: (db) => db.store,
  fromState,
  toState,
  registered: registeredActions,
  define: (conforms) => {
    conforms("createTodo", {
      cases: createTodoCases,
      run: (db, input) =>
        createTodo(db, { name: input.name ?? "", complete: input.complete }),
    });
    conforms("createBulkTodos", {
      cases: createBulkTodosCases,
      run: (db, input) => createBulkTodos(db, { count: input.count ?? 0 }),
    });
    conforms("createRandomTodo", {
      cases: createRandomTodoCases,
      run: (db) => createRandomTodo(db),
    });
    conforms("deleteTodo", {
      cases: deleteTodoCases,
      run: (db, input, resolve) => deleteTodo(db, resolve(input.id ?? -1)),
    });
    conforms("deleteAllTodos", {
      cases: deleteAllTodosCases,
      run: (db) => deleteAllTodos(db),
    });
    conforms("toggleComplete", {
      cases: toggleCompleteCases,
      run: (db, input, resolve) => toggleComplete(db, resolve(input.id ?? -1)),
    });
    conforms("toggleDisplayCompleted", {
      cases: toggleDisplayCompletedCases,
      run: (db) => toggleDisplayCompleted(db),
    });
  },
});
