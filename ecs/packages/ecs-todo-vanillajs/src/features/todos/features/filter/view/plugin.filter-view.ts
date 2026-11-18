// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from "@adobe/ecs";
import { TodoFilters } from "../elements/index.js";
import { setFilter } from "../model/index.js";
import { define, on, root } from "../../../../../view/index.js";
import { findFilters } from "./plugin.filter-view/system.find-filters.js";
import { filterRows } from "./plugin.filter-view/system.filter-rows.js";
import { bindFilters } from "./plugin.filter-view/system.bind-filters.js";

/** Filtering on the page within the app's root: its buttons choose which todos the list shows. */
export const filterView: Plugin<typeof root> = {
    systems: [findFilters, filterRows, bindFilters],
    connect: (world, { [root]: page }) => {
        define({ "todo-filters": TodoFilters });
        return on(page, "todo-filter", event => void world.run(setFilter, { filter: event.detail.filter }));
    },
};
