// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { summary } from "./resource.summary.js";
import { toggleAllBox } from "./resource.toggle-all-box.js";
import { root } from "../../../../../../view/index.js";

/** Finds the summary and the toggle-all checkbox within the app's root, as the root changes. */
export const findCompletion: System = System.create({
    resources: { changed: [root] },
}, ({ resources }) => {
    const within = resources[root];
    resources[summary] = within?.querySelector("todo-summary") ?? null;
    resources[toggleAllBox] = within?.querySelector("todo-toggle-all") ?? null;
});
