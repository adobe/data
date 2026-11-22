// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System } from "@adobe/ecs";
import { Frame } from "@adobe/ecs-gpu";
import { faces } from "../../../selection/model/index.js";
import { editFrame, editing, Instance, instancesIn, lookupsOf, mainModel, model, placements, scale, size } from "../../../voxels/model/index.js";
import { drawnVoxels as drawn } from "./index.drawn-voxels.js";
import { drawList } from "./resource.draw-list.js";
import type { DrawList } from "./type.draw-list.js";
import { addSlots } from "./system.add-slots.js";
import { updateSlots } from "./system.update-slots.js";

/**
 * Lists what the frame draws: from the main model, or a model edited alone, down through its instances, each model's
 * range of drawn voxels once per place it appears; and the model edited, through the instances entered, with its range
 * of selected faces. Replaces the list only when it changed.
 */
export const bindDrawList: System = System.create({
    lookup: {
        models: { with: [model, size, scale] },
        instances: { with: [...Instance] },
        placed: { index: instancesIn },
        voxels: { index: drawn },
        faces: { index: faces },
    },
    after: [addSlots, updateSlots],
    before: [Frame.update],
}, ({ lookup, resources }) => {
    const lookups = lookupsOf(lookup.models, lookup.instances);
    const frame = editFrame(resources[editing], resources[mainModel], lookups);
    if (frame === null) return;
    const root = resources[editing].root;
    const top = lookups.model(root) === null ? resources[mainModel] : root;
    const draws = placements(top, {
        ...lookups,
        instancesIn: holder => {
            const list = lookup.placed(holder);
            const found: Entity[] = [];
            for (let i = 0; i < list.length; i++) found.push(list.at(i).entity);
            return found;
        },
    }).map(each => ({ start: lookup.voxels({ "<": each.model }).length, count: lookup.voxels(each.model).length, toWorld: each.toWorld }));
    const next: DrawList = {
        draws: draws.filter(each => each.count > 0),
        edit: { size: frame.size, toWorld: frame.toWorld },
        faces: { start: lookup.faces({ "<": frame.model }).length, count: lookup.faces(frame.model).length },
    };
    if (resources[drawList] === null || JSON.stringify(resources[drawList]) !== JSON.stringify(next)) resources[drawList] = next;
});
