// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import type { CoreDatabase } from "../core-database/core-database.js";
import type { ConformanceCase } from "../../../data/state/conformance-case.js";
import { expectConforms, type ResolveEntity } from "./expect-conforms.js";
import * as registeredTransactions from "../transaction-database/transactions/index.js";
import { createTodo } from "../transaction-database/transactions/create-todo.js";
import { createBulkTodos } from "../transaction-database/transactions/create-bulk-todos.js";
import { deleteTodo } from "../transaction-database/transactions/delete-todo.js";
import { deleteAllTodos } from "../transaction-database/transactions/delete-all-todos.js";
import { dragTodo } from "../transaction-database/transactions/drag-todo.js";
import { toggleComplete } from "../transaction-database/transactions/toggle-complete.js";
import { toggleDisplayCompleted } from "../transaction-database/transactions/toggle-display-completed.js";
import { cases as createTodoCases } from "../../../data/state/create-todo.js";
import { cases as createBulkTodosCases } from "../../../data/state/create-bulk-todos.js";
import { cases as deleteTodoCases } from "../../../data/state/delete-todo.js";
import { cases as deleteAllTodosCases } from "../../../data/state/delete-all-todos.js";
import { cases as reorderTodoCases } from "../../../data/state/reorder-todo.js";
import { cases as toggleCompleteCases } from "../../../data/state/toggle-complete.js";
import { cases as toggleDisplayCompletedCases } from "../../../data/state/toggle-display-completed.js";

// The single conformance test for every ecs transaction. Unlike the pure
// `data/state/spec.test.ts` (fully uniform, so glob-driven), each transaction's
// `apply` is bespoke — an id-addressed transaction resolves its entity, `dragTodo`
// remaps to a final-drop — and transaction files must stay single-export (the
// `transactions/` barrel is `export *`-ed straight into the plugin facet), so the
// wiring lives here rather than beside each transaction. The guard at the bottom
// asserts every transaction file is wired below, so none can be missed.
const covered = new Set<string>();
const conforms = <Args>(
  transaction: string,
  config: {
    readonly cases: readonly ConformanceCase<Args>[];
    readonly apply: (t: CoreDatabase.Store, args: Args, resolve: ResolveEntity) => void;
  },
): void => {
  covered.add(transaction);
  describe(`${transaction} transaction conforms`, () => expectConforms(config));
};

conforms("createTodo", { cases: createTodoCases, apply: createTodo });
conforms("createBulkTodos", { cases: createBulkTodosCases, apply: createBulkTodos });
conforms("deleteTodo", {
  cases: deleteTodoCases,
  apply: (t, args, resolve) => deleteTodo(t, resolve(args.id)),
});
conforms("deleteAllTodos", { cases: deleteAllTodosCases, apply: deleteAllTodos });
// dragTodo's final drop reproduces State.reorderTodo (its shared cases).
conforms("dragTodo", {
  cases: reorderTodoCases,
  apply: (t, args, resolve) =>
    dragTodo(t, { entity: resolve(args.id), dragPosition: 0, finalIndex: args.toIndex }),
});
conforms("toggleComplete", {
  cases: toggleCompleteCases,
  apply: (t, args, resolve) => toggleComplete(t, resolve(args.id)),
});
conforms("toggleDisplayCompleted", {
  cases: toggleDisplayCompletedCases,
  apply: toggleDisplayCompleted,
});

// None-missed guard: every **registered** transaction must be wired above. Keyed
// off the barrel (the transactions the plugin actually dispatches), not a file
// glob — so a shared read helper parked flat in `transactions/` (kept out of the
// barrel) is naturally excluded.
describe("transaction conformance coverage", () => {
  for (const transaction of Object.keys(registeredTransactions)) {
    it(`${transaction} has a conformance case`, () => expect(covered.has(transaction)).toBe(true));
  }
});
