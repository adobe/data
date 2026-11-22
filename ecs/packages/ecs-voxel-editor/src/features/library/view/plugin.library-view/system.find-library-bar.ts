// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { root } from "../../../../view/index.js";
import { libraryBar } from "./resource.library-bar.js";

/** Finds the library bar within the app's root, as the root changes. */
export const findLibraryBar: System = System.create({
    resources: { changed: [root] },
}, ({ resources }) => {
    resources[libraryBar] = resources[root]?.querySelector("library-bar") ?? null;
});
