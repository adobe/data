import { Resource, System } from "../../../../index.js";
import { done } from "../todos/data.js";
import { row } from "../todos/dom.js";
import { filter } from "./data.js";
import { TodoFilters } from "./elements/todo-filters.js";

/** The page's filter buttons; null until the page provides them. */
export const filters = Symbol("filters");

declare module "@adobe/data-ecs" {
    interface Resources {
        [filters]: { type: TodoFilters | null; thread: "main" };
    }
}

Resource.register(filters, { thread: "main" });

/**
 * Hides each row the filter leaves out, as its todo or the filter changes. A new filter passes every row, but writes
 * only those whose visibility changes; restyling them costs far more than the pass (see the README).
 */
export const filterRows = System.create({
    name: "filter/filterRows",
    observer: true,
    components: { read: [done, row], changed: [done, row] },
    resources: { read: [filter], changed: [filter] },
}, (item, { resources }) => {
    const hidden = resources[filter] === "completed" ? !item[done] : resources[filter] === "active" && item[done];
    if (item[row].hidden !== hidden) item[row].hidden = hidden;
});

export const bindFilters = System.create({
    name: "filter/bindFilters",
    observer: true,
    resources: { read: [filter], changed: [filter], is: [filters] },
}, ({ resources }) => {
    resources[filters].filter = resources[filter];
});

export const dom = [filterRows, bindFilters];
