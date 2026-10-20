import type { Feature } from "../../shared/feature.js";
import { dom, filters } from "./dom.js";
import { defineTodoFilters } from "./elements/todo-filters.js";
import { connect } from "./events.js";

/** Filtering: showing all todos, those not done, or those done. */
export const filter: Feature = {
    define: defineTodoFilters,
    resources: root => ({ [filters]: root.querySelector("todo-filters") }),
    systems: dom,
    connect,
};
