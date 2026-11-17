// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index } from "@adobe/ecs";
import { done } from "./component.done.js";
import { order } from "./component.order.js";
import { todo } from "./component.todo.js";

/** Todos by whether they're done, each set in list order: `lookup(false)` lists those not done. */
export const byDoneInOrder = Index.create({ key: [done, order], sorted: true, components: { with: [todo] } });
