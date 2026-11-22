// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { root } from "../../../../view/index.js";
import { materialDetails } from "./resource.material-details.js";

/** Finds the material details within the app's root, as the root changes. */
export const findMaterialDetails: System = System.create({
    resources: { changed: [root] },
}, ({ resources }) => {
    resources[materialDetails] = resources[root]?.querySelector("material-details") ?? null;
});
