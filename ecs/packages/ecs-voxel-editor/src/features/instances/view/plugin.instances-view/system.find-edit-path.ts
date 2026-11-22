// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { root } from "../../../../view/index.js";
import { editPath } from "./resource.edit-path.js";

/** Finds the path element within the app's root, as the root changes. */
export const findEditPath: System = System.create({
    resources: { changed: [root] },
}, ({ resources }) => {
    resources[editPath] = resources[root]?.querySelector("edit-path") ?? null;
});
