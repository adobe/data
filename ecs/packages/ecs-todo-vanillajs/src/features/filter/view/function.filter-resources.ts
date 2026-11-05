// © 2026 Adobe. MIT License. See /LICENSE for details.
import { filters } from "./shared/resource.filters.js";

/** The page's filter buttons, found within `root`, as the resource its systems read them from. */
export const filterResources = (root: ParentNode) => ({ [filters]: root.querySelector("todo-filters") });
