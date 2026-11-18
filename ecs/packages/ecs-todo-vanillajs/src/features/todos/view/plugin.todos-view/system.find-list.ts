// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { list } from "./resource.list.js";
import { root } from "../../../../view/index.js";

/** Finds the list within the app's root, as the root changes. */
export const findList: System = System.create({
    resources: { changed: [root] },
}, ({ resources }) => {
    resources[list] = resources[root]?.querySelector("todo-list") ?? null;
});
