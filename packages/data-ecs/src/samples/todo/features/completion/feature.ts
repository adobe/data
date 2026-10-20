import type { Feature } from "../../shared/feature.js";
import { dom, summary, toggleAllBox } from "./dom.js";
import { defineTodoSummary } from "./elements/todo-summary.js";
import { defineTodoToggleAll } from "./elements/todo-toggle-all.js";
import { connect } from "./events.js";

/** Completion: how many todos are left, marking all done or none, and clearing those done. */
export const completion: Feature = {
    define: () => {
        defineTodoSummary();
        defineTodoToggleAll();
    },
    resources: root => ({ [summary]: root.querySelector("todo-summary"), [toggleAllBox]: root.querySelector("todo-toggle-all") }),
    systems: dom,
    connect,
};
