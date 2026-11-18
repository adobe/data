// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { onlyDone } from "../../../../model/index.js";
import { filter } from "../../model/index.js";

/** Has the list show only the todos the filter keeps, as the filter changes. */
export const filterRows: System = System.create({
    resources: { changed: [filter] },
}, ({ resources }) => {
    const chosen = resources[filter];
    resources[onlyDone] = chosen === "all" ? null : chosen === "completed";
});
