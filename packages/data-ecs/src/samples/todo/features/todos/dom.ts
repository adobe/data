import { Component, Entity, Finalizer, Index, Resource, System } from "../../../../index.js";
import { done, label, order, todo } from "./data.js";
import { TodoList } from "./elements/todo-list.js";
import { TodoRow } from "./elements/todo-row.js";

/** The row showing a todo. */
export const row = Symbol("row");
/** The page's list, which rows are placed in; null until the page provides it. */
export const list = Symbol("list");

declare module "@adobe/data-ecs" {
    interface Components {
        [row]: { type: TodoRow; thread: "main" };
    }
    interface Resources {
        [list]: { type: TodoList | null; thread: "main" };
    }
}

Component.register(row, { thread: "main" });
Resource.register(list, { thread: "main" });

/** The todo each row shows, for events from rows. Rows are never reused, so an entry lives as long as its row. */
export const todoOf = new WeakMap<Element, Entity>();

/** Todos with rows, in list order. */
const placed = Index.create({ name: "todos/placed", key: [order], sorted: true, components: { has: [todo, row] } });

/** Gives each new todo a row. It isn't placed until the row is the todo's, so a todo gone first never shows one. */
export const createRows = System.create({ name: "todos/createRows", components: { has: [todo], not: [row] } }, (item, { commands }) => {
    const element = document.createElement("todo-row");
    todoOf.set(element, item.entity);
    commands.add(item.entity, row, element);
});

/** Writes what changed of each todo to its row. */
export const bindRows = System.create({
    name: "todos/bindRows",
    observer: true,
    components: { read: [label, done, row], changed: [label, done, row] },
}, item => {
    const element = item[row];
    element.label = item[label];
    element.done = item[done];
});

/**
 * Places each new or moved row after the row before it in list order. Rows pass in list order, so the one before is
 * always placed already; a row already there isn't touched, which keeps its focus.
 */
export const placeRows = System.create({
    name: "todos/placeRows",
    observer: true,
    components: { read: [row, order], changed: [row, order] },
    order: placed,
    resources: { is: [list] },
    lookup: { placed: { index: placed, read: [row] } },
}, (item, { resources, lookup }) => {
    const element = item[row];
    const earlier = lookup.placed({ "<": item[order] });
    const previous = earlier.length === 0 ? null : earlier.at(earlier.length - 1)[row];
    if (previous === null) {
        if (resources[list].firstElementChild !== element) resources[list].prepend(element);
    }
    else if (previous.nextElementSibling !== element) previous.after(element);
});

Finalizer.create({ name: "todos/removeRows", components: { read: [row] } }, item => {
    item[row].remove();
});

/** The todos feature's DOM systems: added ones run on every tick. */
export const dom = [createRows, bindRows, placeRows];
