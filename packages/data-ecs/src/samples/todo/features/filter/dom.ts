import { Resource, System } from "../../../../index.js";
import { list } from "../todos/dom.js";
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

/** The list hides what the filter leaves out by itself, so a new filter is one write, whatever the list holds. */
export const bindList = System.create({
    name: "filter/bindList",
    observer: true,
    resources: { read: [filter], changed: [filter], is: [list] },
}, ({ resources }) => {
    resources[list].filter = resources[filter];
});

export const bindFilters = System.create({
    name: "filter/bindFilters",
    observer: true,
    resources: { read: [filter], changed: [filter], is: [filters] },
}, ({ resources }) => {
    resources[filters].filter = resources[filter];
});

export const dom = [bindList, bindFilters];
