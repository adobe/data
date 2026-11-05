// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { byDone } from "../model/index.js";
import { summary } from "./shared/resource.summary.js";
import { toggleAllBox } from "./shared/resource.toggle-all-box.js";

/**
 * Writes the counts, read off the index's lists, and whether all are done, after a pass in which a todo was added,
 * removed or toggled: the index's entries changing is its only change filter.
 */
export const bindCompletion: System = System.create({
    readonly: true,
    resources: { is: [summary, toggleAllBox] },
    lookup: { byDone: { index: byDone, changed: true } },
}, ({ resources, lookup }) => {
    const remaining = lookup.byDone(false).length;
    const completed = lookup.byDone(true).length;
    resources[summary].remaining = remaining;
    resources[summary].completed = completed;
    resources[toggleAllBox].checked = remaining === 0 && completed > 0;
    resources[toggleAllBox].empty = remaining + completed === 0;
});
