// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, System } from "@adobe/ecs";
import { materials, name } from "../../materials/model/index.js";
import { modelName, models, referencedModels, source } from "../../voxels/model/index.js";
import { applyPlan } from "./internal/function.apply-plan.js";
import { parseFiles } from "./internal/function.parse-files.js";
import { planLoad } from "./internal/function.plan-load.js";
import { planWorld } from "./internal/function.plan-world.js";
import { document } from "./resource.document.js";

/**
 * Brings the main model of the library file at `path`, from `files` by path as texts, into the document as a referenced
 * model, with those it reaches and its materials, merged by name; returns it, the one already brought in for a path the
 * document references, or none, with what couldn't be read.
 */
export const addReference: System<{ readonly path: string; readonly files: readonly (readonly [string, string])[] }, { readonly model: Entity; readonly errors: readonly string[] }> = System.create({
    lookup: { models: { index: models }, referenced: { index: referencedModels }, materials: { index: materials } },
}, ({ lookup, resources, commands }, input: { readonly path: string; readonly files: readonly (readonly [string, string])[] }) => {
    const referenced = lookup.referenced();
    for (let i = 0; i < referenced.length; i++) if (referenced.at(i)[source] === input.path) return { model: referenced.at(i).entity, errors: [] };
    const all = lookup.models();
    const taken = new Set<string>();
    for (let i = 0; i < all.length; i++) taken.add(all.at(i)[modelName]);
    const { files, errors: unread } = parseFiles(input.files);
    const { plan, key } = planLoad(files, { path: input.path, name: null }, resources[document].path, taken);
    if (key === null) return { model: Entity.none, errors: [...unread, ...plan.errors] };
    const known = lookup.materials();
    const present = [];
    for (let i = 0; i < known.length; i++) present.push({ name: known.at(i)[name], entity: known.at(i).entity });
    const { entities, errors } = applyPlan(plan, planWorld(commands, present));
    return { model: entities.get(key) ?? Entity.none, errors: [...unread, ...errors] };
});
