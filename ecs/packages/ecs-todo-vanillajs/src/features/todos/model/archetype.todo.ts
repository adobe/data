// © 2026 Adobe. MIT License. See /LICENSE for details.
import { done } from "./persistent.component.done.js";
import { label } from "./persistent.component.label.js";
import { order } from "./persistent.component.order.js";
import { todo } from "./persistent.component.todo.js";

/** What a todo spawns with. */
export const Todo = [todo, label, done, order] as const;
