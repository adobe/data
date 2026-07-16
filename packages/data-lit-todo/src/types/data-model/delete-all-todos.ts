// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { DataModel } from "./data-model.js";

export const deleteAllTodos = <T extends Pick<DataModel, "todos">>(model: T): T => ({
  ...model,
  todos: [],
});
