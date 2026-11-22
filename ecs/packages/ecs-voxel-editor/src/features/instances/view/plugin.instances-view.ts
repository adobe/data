// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity, Plugin } from "@adobe/ecs";
import { EditPath } from "../elements/index.js";
import { editModel, leaveTo, makeLocal } from "../model/index.js";
import { all, define, on, root } from "../../../view/index.js";
import { bindEditPath } from "./plugin.instances-view/system.bind-edit-path.js";
import { findEditPath } from "./plugin.instances-view/system.find-edit-path.js";

/** The path to the model being edited, within the app's root: stepping back out along it, and copying a referenced model locally. */
export const instancesView: Plugin<typeof root> = {
    systems: [findEditPath, bindEditPath],
    connect: (world, { [root]: page }) => {
        define({ "edit-path": EditPath });
        return all(
            on(page, "edit-path-leave", event => void world.run(leaveTo, { depth: event.detail.depth })),
            // The element's models are entities, as bindEditPath gives them.
            on(page, "edit-path-local", event => void world.run(makeLocal, { model: event.detail.model as Entity })),
            on(page, "edit-path-edit", event => void world.run(editModel, { model: event.detail.model as Entity })),
        );
    },
};
