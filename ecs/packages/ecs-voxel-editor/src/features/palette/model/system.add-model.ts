// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { editing, editingOf, mainModel, Model, model, modelName, modelNamed, scale, size } from "../../voxels/model/index.js";

/**
 * Adds a model of a new name, `size` voxels a side, scaled to fill one voxel of the main model, and edits it alone;
 * returns why it couldn't, null when it did: a blank name or one the document has.
 */
export const addModel: System<{ readonly name: string; readonly size: number }, string | null> = System.create({
    lookup: { named: { index: modelNamed }, models: { with: [model, scale] } },
}, ({ lookup, resources, commands }, input: { readonly name: string; readonly size: number }) => {
    const wanted = input.name.trim();
    if (wanted === "") return "A model needs a name.";
    if (lookup.named(wanted) !== null) return `There's already a model "${wanted}".`;
    const unit = lookup.models(resources[mainModel])?.[scale] ?? [1, 1, 1];
    const n = Math.max(1, Math.round(input.size));
    const made = commands.spawn(Model)({ [model]: true, [modelName]: wanted, [size]: [n, n, n], [scale]: [unit[0] / n, unit[1] / n, unit[2] / n] });
    resources[editing] = editingOf(made, [], made);
    return null;
});
