// © 2026 Adobe. MIT License. See /LICENSE for details.
import { done } from "./component.done.js";
import { label } from "./component.label.js";
import { order } from "./component.order.js";
import { todo } from "./component.todo.js";

/** What a todo spawns with. */
export const Todo = [todo, label, done, order] as const;
