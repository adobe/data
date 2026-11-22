// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from "@adobe/ecs";
import { ModelSize } from "../elements/index.js";
import { fitModel, lockSize, resizeModel } from "../model/index.js";
import { modelOfEditing } from "./plugin.sizing-view/system.model-of-editing.js";
import { all, define, on, root } from "../../../view/index.js";
import { bindModelSize } from "./plugin.sizing-view/system.bind-model-size.js";
import { findModelSize } from "./plugin.sizing-view/system.find-model-size.js";
import { refreshModelSize } from "./plugin.sizing-view/system.refresh-model-size.js";

/** The edited model's size panel within the app's root: sizing it, fitting it to its contents, and locking its size. */
export const sizingView: Plugin<typeof root> = {
    systems: [findModelSize, bindModelSize, refreshModelSize],
    connect: (world, { [root]: page }) => {
        define({ "model-size": ModelSize });
        return all(
            on(page, "model-size", event => void world.run(modelOfEditing).then(model => world.run(resizeModel, { model, size: event.detail.size }))),
            on(page, "model-size-lock", event => void world.run(modelOfEditing).then(model => world.run(lockSize, { model, locked: event.detail.locked }))),
            on(page, "model-size-fit", () => void world.run(modelOfEditing).then(model => world.run(fitModel, { model }))),
        );
    },
};
