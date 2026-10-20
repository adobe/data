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
 * Hides each row the filter leaves out, as its todo or the filter changes. A row whose visibility stays the same isn't
 * written, and only rows hidden or shown again restyle: a new filter costs a pass over the rows and the style of those
 * that change, where one attribute of the list that style sheets select rows by restyles every row.
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
