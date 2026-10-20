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

/**
 * Gives each new todo a row, while the page has a list for it. It isn't placed until the row is the todo's, so a todo
 * gone first never shows one.
 */
export const createRows = System.create({
    name: "todos/createRows",
    components: { has: [todo], not: [row] },
    resources: { is: [list] },
}, (item, { commands }) => {
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
 * Puts `element` before `before` in `parent`. One already there moves with `moveBefore`, without leaving it, where the
 * browser has it; otherwise it leaves and comes back, and gets back the focus it had.
 */
const place = (parent: Element, element: HTMLElement, before: Element | null): void => {
    const moveBefore: unknown = Reflect.get(parent, "moveBefore");
    if (element.parentNode === parent && typeof moveBefore === "function") {
        Reflect.apply(moveBefore, parent, [element, before]);
        return;
    }
    const focused = element.matches(":focus");
    parent.insertBefore(element, before);
    if (focused) element.focus({ preventScroll: true });
};

/**
 * Places each new or moved row after the row before it in list order. Rows pass in list order, so the one before is
 * always placed already. A row already there isn't touched, and one in the list moves without leaving it, which keeps
 * its focus.
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
    const parent = resources[list];
    const earlier = lookup.placed({ "<": item[order] });
    const before = earlier.length === 0 ? parent.firstElementChild : earlier.at(earlier.length - 1)[row].nextElementSibling;
    if (before !== element) place(parent, element, before);
});

Finalizer.create({ name: "todos/removeRows", components: { read: [row] } }, item => {
    item[row].remove();
});

/** The todos feature's DOM systems: added ones run on every tick. */
export const dom = [createRows, bindRows, placeRows];
