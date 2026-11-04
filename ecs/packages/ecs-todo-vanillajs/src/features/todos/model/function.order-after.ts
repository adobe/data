// © 2026 Adobe. MIT License. See /LICENSE for details.
import { order } from "./component.order.js";

/** The order just after the last of `ordered`'s todos, as a lookup through it gives them: 0 for none. */
export const orderAfter = (todos: { readonly length: number; readonly at: (index: number) => { readonly [order]: number } }): number =>
    todos.length === 0 ? 0 : todos.at(todos.length - 1)[order] + 1;
