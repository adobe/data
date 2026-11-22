// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { root } from "../../../../view/index.js";
import { palettePanel } from "./resource.palette-panel.js";

/** Finds the palette within the app's root, as the root changes. */
export const findPalettePanel: System = System.create({
    resources: { changed: [root] },
}, ({ resources }) => {
    resources[palettePanel] = resources[root]?.querySelector("palette-panel") ?? null;
});
