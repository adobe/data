import { Resource, System } from "../../../../index.js";
import { byDone } from "./data.js";
import { TodoSummary } from "./elements/todo-summary.js";
import { TodoToggleAll } from "./elements/todo-toggle-all.js";

/** The page's summary and toggle-all checkbox; null until the page provides them. */
export const summary = Symbol("summary");
export const toggleAllBox = Symbol("toggleAllBox");

declare module "@adobe/data-ecs" {
    interface Resources {
        [summary]: { type: TodoSummary | null; thread: "main" };
        [toggleAllBox]: { type: TodoToggleAll | null; thread: "main" };
    }
}

Resource.register(summary, { thread: "main" });
Resource.register(toggleAllBox, { thread: "main" });

/** Writes the counts, read off the index's lists, after a pass in which a todo was added, removed or toggled. */
export const bindSummary = System.create({
    name: "completion/bindSummary",
    observer: true,
    resources: { is: [summary] },
    lookup: { byDone: { index: byDone } },
}, ({ resources, lookup }) => {
    const remaining = lookup.byDone(false);
    const completed = lookup.byDone(true);
    if (!remaining.changed && !completed.changed) return;
    resources[summary].remaining = remaining.length;
    resources[summary].completed = completed.length;
});

export const bindToggleAll = System.create({
    name: "completion/bindToggleAll",
    observer: true,
    resources: { is: [toggleAllBox] },
    lookup: { byDone: { index: byDone } },
}, ({ resources, lookup }) => {
    const remaining = lookup.byDone(false);
    const completed = lookup.byDone(true);
    if (!remaining.changed && !completed.changed) return;
    resources[toggleAllBox].checked = remaining.length === 0 && completed.length > 0;
    resources[toggleAllBox].empty = remaining.length + completed.length === 0;
});

export const dom = [bindSummary, bindToggleAll];
