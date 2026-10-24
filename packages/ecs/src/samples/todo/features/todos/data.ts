// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index } from "../../../../index.js";

/** A todo's text. */
export const label = Symbol();
export const done = Symbol();
/** Where a todo sits in the list: todos are listed by ascending order. */
export const order = Symbol();
export const todo = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [label]: { type: string };
        [done]: { type: boolean };
        [order]: { type: number };
        [todo]: { type: true };
    }
}

export const Todo = [todo, label, done, order] as const;

/** Every todo, in list order. */
export const ordered = Index.create({ key: [order], sorted: true, components: { with: [todo] } });

/** The order just after the last of `ordered`'s todos, as a lookup through it gives them: 0 for none. */
export const orderAfter = (todos: { readonly length: number; readonly at: (index: number) => { readonly [order]: number } }): number =>
    todos.length === 0 ? 0 : todos.at(todos.length - 1)[order] + 1;
