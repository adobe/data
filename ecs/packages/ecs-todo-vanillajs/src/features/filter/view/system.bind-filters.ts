// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { filter } from "../model/index.js";
import { filters } from "./shared/resource.filters.js";

/** Shows the filter on the page's filter buttons. */
export const bindFilters: System = System.create({
    readonly: true,
    resources: { changed: [filter], is: [filters] },
}, ({ resources }) => {
    resources[filters].filter = resources[filter];
});
