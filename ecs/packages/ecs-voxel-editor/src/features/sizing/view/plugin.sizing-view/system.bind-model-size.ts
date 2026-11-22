// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { editing, model, modelName, size, sizeUnlocked, unlockedModels } from "../../../voxels/model/index.js";
import { modelSize } from "./resource.model-size.js";

/** Writes the edited model's name, size and lock to the panel, as editing moves to another model or which are locked changes. */
export const bindModelSize: System = System.create({
    readonly: true,
    resources: { is: [modelSize], changed: [modelSize, editing] },
    lookup: { models: { with: [model, modelName, size], optional: [sizeUnlocked] }, unlocked: { index: unlockedModels, changed: true } },
}, ({ resources, lookup }) => {
    const row = lookup.models(resources[editing].model);
    if (row === null) return;
    const panel = resources[modelSize];
    panel.label = row[modelName];
    panel.size = [row[size][0], row[size][1], row[size][2]];
    panel.locked = row[sizeUnlocked] !== true;
});
