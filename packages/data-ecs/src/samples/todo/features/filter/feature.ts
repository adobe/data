import type { Feature } from "../../shared/feature.js";
import { dom, filters } from "./dom.js";
import { TodoFilters } from "./elements/todo-filters.js";
import { connect } from "./events.js";

/** Filtering: showing all todos, those not done, or those done. */
export const filter: Feature = {
    elements: { "todo-filters": TodoFilters },
    resources: root => ({ [filters]: root.querySelector("todo-filters") }),
    system: dom,
    connect,
};
