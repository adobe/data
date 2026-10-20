import type { Feature } from "../../shared/feature.js";
import { dom, list } from "./dom.js";
import { defineTodoEntry } from "./elements/todo-entry.js";
import { defineTodoList } from "./elements/todo-list.js";
import { defineTodoRow } from "./elements/todo-row.js";
import { connect } from "./events.js";

/** Todos: adding, toggling, editing, deleting and moving them, in the page's list. */
export const todos: Feature = {
    define: () => {
        defineTodoRow();
        defineTodoList();
        defineTodoEntry();
    },
    resources: root => ({ [list]: root.querySelector("todo-list") }),
    systems: dom,
    connect,
};
