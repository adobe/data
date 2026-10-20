import { Archetype, Component, Index } from "../../../../index.js";

/** A todo's text. On `main`, as every object value a DOM binding reads must be. */
export const label = Symbol("label");
export const done = Symbol("done");
/** Where a todo sits in the list: todos are listed by ascending order. */
export const order = Symbol("order");
export const todo = Symbol("todo");

declare module "@adobe/data-ecs" {
    interface Components {
        [label]: { type: string; thread: "main" };
        [done]: { type: boolean };
        [order]: { type: number };
        [todo]: { type: true };
    }
}

Component.register(label, { type: { type: "string" }, thread: "main" });
Component.register(done, { type: { type: "boolean" } });
Component.register(order, { type: { type: "number" } });
Component.register(todo, { type: { const: true } });

export const Todo = Archetype.create([todo, label, done, order]);

/** Every todo, in list order. */
export const ordered = Index.create({ name: "todos/ordered", key: [order], sorted: true, components: { has: [todo] } });
