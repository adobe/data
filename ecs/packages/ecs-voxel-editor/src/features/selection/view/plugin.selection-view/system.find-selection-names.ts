// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { root } from "../../../../view/index.js";
import { selectionNames } from "./resource.selection-names.js";

/** Finds the list of saved selections within the app's root, as the root changes. */
export const findSelectionNames: System = System.create({
    resources: { changed: [root] },
}, ({ resources }) => {
    resources[selectionNames] = resources[root]?.querySelector("selection-names") ?? null;
});
