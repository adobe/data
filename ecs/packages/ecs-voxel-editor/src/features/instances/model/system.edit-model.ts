// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System } from "@adobe/ecs";
import { faces } from "../../selection/model/index.js";
import { editing, editingOf, mainModel, model } from "../../voxels/model/index.js";

/** Edits a model shown alone, or the main model in the whole scene, deselecting the faces of any other model left. */
export const editModel: System<{ readonly model: Entity }> = System.create({
    lookup: { models: { with: [model] }, faces: { index: faces } },
}, ({ lookup, resources, commands }, input: { readonly model: Entity }) => {
    const current = resources[editing];
    if (lookup.models(input.model) === null || (current !== null && current.depth === 0 && current.root === input.model)) return;
    if (current !== null && current.model !== resources[mainModel] && current.model !== input.model) {
        const selected = lookup.faces(current.model);
        for (let i = 0; i < selected.length; i++) commands.despawn(selected.at(i).entity);
    }
    resources[editing] = editingOf(input.model, [], input.model);
});
