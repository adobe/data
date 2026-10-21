import { Resource, System } from "../../../../index.js";
import { byDone } from "./data.js";
import { TodoSummary } from "./elements/todo-summary.js";
import { TodoToggleAll } from "./elements/todo-toggle-all.js";

/** The page's summary and toggle-all checkbox; null until the page provides them. */
export const summary = Symbol("summary");
export const toggleAllBox = Symbol("toggleAllBox");

declare module "@adobe/ecs" {
    interface Resources {
        [summary]: { type: TodoSummary | null; thread: "main" };
        [toggleAllBox]: { type: TodoToggleAll | null; thread: "main" };
    }
}

Resource.register(summary, { thread: "main" });
Resource.register(toggleAllBox, { thread: "main" });

/**
 * Writes the counts, read off the index's lists, and whether all are done, after a pass in which a todo was added,
 * removed or toggled: the index's entries changing is its only change filter.
 */
export const bindCompletion = System.create({
    name: "completion/bindCompletion",
    observer: true,
    resources: { is: [summary, toggleAllBox] },
    lookup: { byDone: { index: byDone, changed: true } },
}, ({ resources, lookup }) => {
    const remaining = lookup.byDone(false).length;
    const completed = lookup.byDone(true).length;
    resources[summary].remaining = remaining;
    resources[summary].completed = completed;
    resources[toggleAllBox].checked = remaining === 0 && completed > 0;
    resources[toggleAllBox].empty = remaining + completed === 0;
});

/** The completion feature's DOM systems, as one composite: added, it runs on every tick. */
export const dom = System.create([bindCompletion]);
