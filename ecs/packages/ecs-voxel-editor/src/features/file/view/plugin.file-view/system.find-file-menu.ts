// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import type { MenuButton } from "../../../../elements/index.js";
import { root } from "../../../../view/index.js";
import { fileMenu } from "./resource.file-menu.js";

/** Finds the file menu within the app's root, as the root changes. */
export const findFileMenu: System = System.create({
    resources: { changed: [root] },
}, ({ resources }) => {
    resources[fileMenu] = resources[root]?.querySelector<MenuButton>("menu-button.file") ?? null;
});
