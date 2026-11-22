// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from "@adobe/ecs";
import { SelectionNames } from "../elements/index.js";
import { forgetSelection, restoreSelection, saveSelection } from "../model/index.js";
import { all, define, on, root } from "../../../view/index.js";
import { bindSelectionNames } from "./plugin.selection-view/system.bind-selection-names.js";
import { findSelectionNames } from "./plugin.selection-view/system.find-selection-names.js";

/** The main model's saved selections, within the app's root: saving the selection by name, selecting one again and forgetting one. */
export const selectionView: Plugin<typeof root> = {
    systems: [findSelectionNames, bindSelectionNames],
    connect: (world, { [root]: page }) => {
        define({ "selection-names": SelectionNames });
        return all(
            on(page, "selection-save", event => void world.run(saveSelection, { name: event.detail.name })),
            on(page, "selection-restore", event => void world.run(restoreSelection, { name: event.detail.name, add: event.detail.add })),
            on(page, "selection-forget", event => void world.run(forgetSelection, { name: event.detail.name })),
        );
    },
};
