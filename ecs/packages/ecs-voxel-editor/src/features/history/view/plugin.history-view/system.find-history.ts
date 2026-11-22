// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { root } from "../../../../view/index.js";
import { historyButtons } from "./resource.history-buttons.js";

/** Finds the undo and redo buttons within the app's root, as the root changes. */
export const findHistory: System = System.create({
    resources: { changed: [root] },
}, ({ resources }) => {
    const undo = resources[root]?.querySelector<HTMLElement>('[data-history="undo"]') ?? null;
    const redo = resources[root]?.querySelector<HTMLElement>('[data-history="redo"]') ?? null;
    resources[historyButtons] = undo === null || redo === null ? null : { undo, redo };
});
