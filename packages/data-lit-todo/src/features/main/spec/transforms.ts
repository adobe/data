// © 2026 Adobe. MIT License. See /LICENSE for details.

// The conformed functions of this feature — every pure transform and derivation the
// spec verifies, and nothing else (helpers like `appendTodo`, `create`, `samples`
// are deliberately absent). Its keys ARE the conformance surface: the manifest's
// coverage guard (`Conformance.feature`) requires exactly one `*.cases.ts` module
// per key here, so adding a transform without cases — or cases without a transform —
// fails to compile. This is a per-feature, local barrel (not a cross-feature
// registry), authored where the transforms live.
export { createTodo } from "./create-todo.js";
export { createRandomTodo } from "./create-random-todo.js";
export { createBulkTodos } from "./create-bulk-todos.js";
export { deleteTodo } from "./delete-todo.js";
export { deleteAllTodos } from "./delete-all-todos.js";
export { toggleComplete } from "./toggle-complete.js";
export { toggleDisplayCompleted } from "./toggle-display-completed.js";
export { reorderTodo } from "./reorder-todo.js";
export { selectTodo } from "./select-todo.js";
export { visibleTodos } from "./visible-todos.js";
