// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System } from "@adobe/ecs";
import type { EditStep } from "../../elements/index.js";
import { chainOf, editing, Instance, mainModel, instanceOf, model, modelName, referencedModels, source } from "../../../voxels/model/index.js";
import { editPath } from "./resource.edit-path.js";

/** Writes the path to the model being edited, its names and the library file of each referenced one, as editing or which models are referenced changes. */
export const bindEditPath: System = System.create({
    readonly: true,
    resources: { is: [editPath], changed: [editing, editPath, mainModel] },
    lookup: { models: { with: [model, modelName], optional: [source] }, instances: { with: [...Instance] }, referenced: { index: referencedModels, changed: true } },
}, ({ resources, lookup }) => {
    const current = resources[editing];
    if (current === null) return;
    const step = (entity: Entity, depth: number | null): EditStep => {
        const row = lookup.models(entity);
        return { label: row?.[modelName] ?? "?", model: entity, referenced: row?.[source] ?? null, depth };
    };
    const main = resources[mainModel];
    // A model edited alone is reached from the main model by editing it alone in turn.
    const back = current.root === main || lookup.models(main) === null ? [] : [step(main, null)];
    resources[editPath].steps = [...back, step(current.root, 0), ...chainOf(current).map((link, i) => step(lookup.instances(link)?.[instanceOf] ?? current.root, i + 1))];
});
