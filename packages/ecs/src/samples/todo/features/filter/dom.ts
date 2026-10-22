import { Resource, System } from "../../../../index.js";
import { done } from "../todos/data.js";
import { row } from "../todos/dom.js";
import { TodoRow } from "../todos/elements/todo-row.js";
import { filter, type Filter } from "./data.js";
import { TodoFilters } from "./elements/todo-filters.js";

/** The page's filter buttons; null until the page provides them. */
export const filters = Symbol("filters");

declare module "@adobe/ecs" {
    interface Resources {
        [filters]: { type: TodoFilters | null; thread: "main" };
    }
}

Resource.register(filters, { thread: "main" });

/** Whether the filter leaves a todo out. */
const leavesOut = (chosen: Filter, isDone: boolean): boolean => chosen === "completed" ? !isDone : chosen === "active" && isDone;

const siblingOf = (node: Element, forward: boolean): Element | null => forward ? node.nextElementSibling : node.previousElementSibling;

/**
 * Focuses the row nearest `hiding` that the filter shows, after it or else before it, judged by the rows' `done`
 * rather than their `hidden`, which this pass may not have reached yet.
 */
const focusNearest = (hiding: Element, chosen: Filter): void => {
    for (const forward of [true, false]) {
        for (let node = siblingOf(hiding, forward); node !== null; node = siblingOf(node, forward)) {
            if (node instanceof TodoRow && !leavesOut(chosen, node.done)) return node.focus({ preventScroll: true });
        }
    }
};

/**
 * Hides each row the filter leaves out, as its todo or the filter changes, moving focus off it. A new filter passes
 * every row, but writes only those whose visibility changes; restyling them costs far more than the pass (see the
 * README).
 */
export const filterRows = System.create({
    name: "filter/filterRows",
    observer: true,
    components: { read: [done, row], changed: [done, row] },
    resources: { read: [filter], changed: [filter] },
}, (item, { resources }) => {
    const element = item[row];
    const hidden = leavesOut(resources[filter], item[done]);
    if (element.hidden === hidden) return;
    if (hidden && element.matches(":focus-within")) focusNearest(element, resources[filter]);
    element.hidden = hidden;
});

export const bindFilters = System.create({
    name: "filter/bindFilters",
    observer: true,
    resources: { read: [filter], changed: [filter], is: [filters] },
}, ({ resources }) => {
    resources[filters].filter = resources[filter];
});

/** The filter feature's DOM systems, as one composite: added, it runs on every tick. */
export const dom = System.create([filterRows, bindFilters]);
