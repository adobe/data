// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { filters } from "./resource.filters.js";
import { root } from "../../../../../../view/index.js";

/** Finds the filter buttons within the app's root, as the root changes. */
export const findFilters: System = System.create({
    resources: { changed: [root] },
}, ({ resources }) => {
    resources[filters] = resources[root]?.querySelector("todo-filters") ?? null;
});
