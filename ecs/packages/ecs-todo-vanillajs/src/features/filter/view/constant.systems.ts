// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { System } from "@adobe/ecs";
import { bindFilters } from "./system.bind-filters.js";
import { filterRows } from "./system.filter-rows.js";

/** The filter's DOM systems: choosing the todos the list shows, and showing the filter on its buttons. */
export const systems: readonly System[] = [filterRows, bindFilters];
