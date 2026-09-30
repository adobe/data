// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import * as transforms from "./transforms.js";
import { components } from "../data/components/index.js";
import { resources } from "../data/resources/index.js";
import { AnalyticsService } from "../services/analytics-service/analytics-service.js";
import { NameGeneratorService } from "../services/name-generator-service/name-generator-service.js";

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

// The feature's spec: every action and derivation, one inert cases module each
// (coverage checked at compile time against `transforms`). `schemas` lets the runner
// find entity references (`selectedTodo`); `services` are the fake templates the
// runner builds recording doubles from. `ecs/conformance/` pairs this with the ECS build.
export const spec = Conformance.spec({
  state: State,
  fns: transforms,
  schemas: { ...components, ...resources },
  services: { analytics: AnalyticsService.createFake, nameGenerator: NameGeneratorService.createFake },
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
