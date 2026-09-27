// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import * as transforms from "./transforms.js";
import { MainService } from "../../services/main-service/main-service.js";
import { ComputedDatabase } from "../../services/main-service/computed-database/computed-database.js";
import { projection } from "../../services/main-service/conformance/projection.js";
import { createFake as analytics } from "../../services/analytics-service/analytics.fake.js";
import { createFake as nameGenerator } from "../../services/name-generator-service/name-generator.fake.js";

import { cases as createTodo } from "./create-todo.cases.js";
import { cases as createRandomTodo } from "./create-random-todo.cases.js";
import { cases as createBulkTodos } from "./create-bulk-todos.cases.js";
import { cases as deleteTodo } from "./delete-todo.cases.js";
import { cases as deleteAllTodos } from "./delete-all-todos.cases.js";
import { cases as toggleComplete } from "./toggle-complete.cases.js";
import { cases as toggleDisplayCompleted } from "./toggle-display-completed.cases.js";
import { cases as reorderTodo } from "./reorder-todo.cases.js";
import { cases as selectTodo } from "./select-todo.cases.js";
import { cases as visibleTodos } from "./visible-todos.cases.js";

// The feature's conformance manifest — the single object `spec.test.ts` (pure) and
// `conformance.test.ts` (ecs) both import. It wires each conformed fn to its inert cases module explicitly: `cases` names one module per conformed fn,
// checked at COMPILE TIME against `transforms` (a fn without cases, or cases without
// a fn, won't type). `services` are the shape-only recording-double templates the
// runner synthesizes returns into from each case's `responses`; `visibleTodos` emits
// entity ids, so it is named in `hydrate` to project each through `toData`.
//
// This is a test-tier module (excluded from the runtime program) — the ONE place the
// feature touches `@adobe/data-testing`. No transform or `*.cases.ts` file does.
export const spec = Conformance.feature({
  state: State,
  fns: transforms,
  plugin: MainService.plugin,
  computedPlugin: ComputedDatabase.plugin,
  projection,
  hydrate: ["visibleTodos"],
  services: { analytics, nameGenerator },
  cases: {
    createTodo,
    createRandomTodo,
    createBulkTodos,
    deleteTodo,
    deleteAllTodos,
    toggleComplete,
    toggleDisplayCompleted,
    reorderTodo,
    selectTodo,
    visibleTodos,
  },
});
