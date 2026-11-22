// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from "@adobe/ecs";
import { redo, undo } from "../model/index.js";
import { on, root } from "../../../view/index.js";
import { bindHistory } from "./plugin.history-view/system.bind-history.js";
import { findHistory } from "./plugin.history-view/system.find-history.js";

/**
 * The toolbar's undo and redo buttons within the app's root, `[data-history="undo"]` and `[data-history="redo"]`:
 * clicking one runs it, and each is disabled while there's nothing to undo or redo.
 */
export const historyView: Plugin<typeof root> = {
    systems: [findHistory, bindHistory],
    connect: (world, { [root]: page }) => on(page, "click", event => {
        const button = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-history]") : null;
        const action = button?.dataset["history"];
        if (action === "undo") void world.run(undo);
        else if (action === "redo") void world.run(redo);
    }),
};
