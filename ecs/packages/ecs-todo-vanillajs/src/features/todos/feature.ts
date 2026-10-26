// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Feature } from "../../shared/feature.js";
import { dom, list } from "./dom.js";
import { TodoEntry } from "./elements/todo-entry.js";
import { TodoList } from "./elements/todo-list.js";
import { TodoRow } from "./elements/todo-row.js";
import { connect } from "./events.js";

/** Todos: adding, toggling, editing, deleting and moving them, in the page's list. */
export const todos: Feature = {
    elements: { "todo-entry": TodoEntry, "todo-list": TodoList, "todo-row": TodoRow },
    resources: root => ({ [list]: root.querySelector("todo-list") }),
    system: dom,
    connect,
};
