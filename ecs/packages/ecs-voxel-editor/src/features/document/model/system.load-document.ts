// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { materials, name } from "../../materials/model/index.js";
import { namedSelections } from "../../selection/model/index.js";
import { editing, editingOf, mainModel, models } from "../../voxels/model/index.js";
import { applyPlan } from "./internal/function.apply-plan.js";
import { parseFiles } from "./internal/function.parse-files.js";
import { planLoad } from "./internal/function.plan-load.js";
import { planWorld } from "./internal/function.plan-world.js";
import { document } from "./resource.document.js";

/**
 * Opens the document at `path`, from `files`, its file and those it references, by path, as texts: every model is
 * replaced by its models and those they reach, each referenced one keeping its library file as its source; its
 * materials are merged into the document's by name; and its main model's saved selections replace the document's.
 * Returns what couldn't be read.
 */
export const loadDocument: System<{ readonly path: string; readonly files: readonly (readonly [string, string])[] }, readonly string[]> = System.create({
    lookup: { models: { index: models }, materials: { index: materials } },
}, ({ lookup, resources, commands }, input: { readonly path: string; readonly files: readonly (readonly [string, string])[] }) => {
    const { files, errors: unread } = parseFiles(input.files);
    const { plan, key } = planLoad(files, { path: input.path, name: null }, input.path, new Set());
    const main = plan.models.find(each => each.key === key);
    if (key === null || main === undefined) return [...unread, ...plan.errors, `${input.path} has no main model.`];
    const all = lookup.models();
    for (let i = 0; i < all.length; i++) commands.despawn(all.at(i).entity);
    const known = lookup.materials();
    const present = [];
    for (let i = 0; i < known.length; i++) present.push({ name: known.at(i)[name], entity: known.at(i).entity });
    const { entities, errors } = applyPlan(plan, planWorld(commands, present));
    const top = entities.get(key);
    if (top !== undefined) {
        resources[mainModel] = top;
        resources[editing] = editingOf(top, [], top);
    }
    resources[namedSelections] = new Map(Object.entries(main.selections));
    resources[document] = { path: input.path };
    return [...unread, ...errors];
});
