// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { filter } from "./resource.filter.js";
import type { Filter } from "./type.filter.js";

/** Chooses which todos the list shows. */
export const setFilter: System<{ readonly filter: Filter }> = System.create({}, ({ resources }, input: { readonly filter: Filter }) => {
    resources[filter] = input.filter;
});
