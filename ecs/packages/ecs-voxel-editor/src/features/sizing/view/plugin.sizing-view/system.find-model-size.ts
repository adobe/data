// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { root } from "../../../../view/index.js";
import { modelSize } from "./resource.model-size.js";

/** Finds the model size panel within the app's root, as the root changes. */
export const findModelSize: System = System.create({
    resources: { changed: [root] },
}, ({ resources }) => {
    resources[modelSize] = resources[root]?.querySelector("model-size") ?? null;
});
