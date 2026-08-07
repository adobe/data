// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data/testing";
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
import { createStore } from "./create-store.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// The single conformance test for every ecs transaction. `runTransactions` owns
// the harness (fresh store, `fromState` seed, `resolve`, `toState` compare,
// coverage guard keyed off the registered barrel); only the bespoke `apply`
// adapters are per-transaction — an id-addressed transaction resolves its entity,
// `dragTodo` remaps to a final-drop reproducing `State.reorderTodo`.
Conformance.runTransactions({
  createStore,
  fromState,
  toState,
  registered: registeredTransactions,
  define: (conforms) => {
    conforms("createTodo", { cases: createTodoCases, apply: createTodo });
    conforms("createBulkTodos", {
      cases: createBulkTodosCases,
      apply: createBulkTodos,
    });
    conforms("deleteTodo", {
      cases: deleteTodoCases,
      apply: (t, args, resolve) => deleteTodo(t, resolve(args.id)),
    });
    conforms("deleteAllTodos", {
      cases: deleteAllTodosCases,
      apply: deleteAllTodos,
    });
    conforms("dragTodo", {
      cases: reorderTodoCases,
      apply: (t, args, resolve) =>
        dragTodo(t, {
          entity: resolve(args.id),
          dragPosition: 0,
          finalIndex: args.toIndex,
        }),
    });
    conforms("toggleComplete", {
      cases: toggleCompleteCases,
      apply: (t, args, resolve) => toggleComplete(t, resolve(args.id)),
    });
    conforms("toggleDisplayCompleted", {
      cases: toggleDisplayCompletedCases,
      apply: toggleDisplayCompleted,
    });
  },
});
