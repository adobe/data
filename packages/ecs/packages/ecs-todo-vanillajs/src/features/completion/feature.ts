// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Feature } from "../../shared/feature.js";
import { dom, summary, toggleAllBox } from "./dom.js";
import { TodoSummary } from "./elements/todo-summary.js";
import { TodoToggleAll } from "./elements/todo-toggle-all.js";
import { connect } from "./events.js";

/** Completion: how many todos are left, marking all done or none, and clearing those done. */
export const completion: Feature = {
    elements: { "todo-summary": TodoSummary, "todo-toggle-all": TodoToggleAll },
    resources: root => ({ [summary]: root.querySelector("todo-summary"), [toggleAllBox]: root.querySelector("todo-toggle-all") }),
    system: dom,
    connect,
};
