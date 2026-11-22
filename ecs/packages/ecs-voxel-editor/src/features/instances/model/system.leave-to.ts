// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { faces } from "../../selection/model/index.js";
import { chainOf, editing, editingOf, instanceOf, Instance, mainModel } from "../../voxels/model/index.js";

/**
 * Leaves the instances entered for the model `depth` of them in: 0 for the root, -1 for one level out. Only the main
 * model's selection is kept: leaving any other model deselects its faces.
 */
export const leaveTo: System<{ readonly depth: number }> = System.create({
    lookup: { instances: { with: [...Instance] }, faces: { index: faces } },
}, ({ lookup, resources, commands }, input: { readonly depth: number }) => {
    const current = resources[editing];
    if (current === null) return;
    const entered = chainOf(current);
    const depth = input.depth < 0 ? Math.max(0, entered.length + input.depth) : Math.min(input.depth, entered.length);
    if (depth === entered.length) return;
    const chain = entered.slice(0, depth);
    const last = chain.at(-1);
    const placed = last === undefined ? null : lookup.instances(last);
    const next = placed === null ? current.root : placed[instanceOf];
    for (const left of entered.slice(depth).map(link => lookup.instances(link)?.[instanceOf])) {
        if (left === undefined || left === resources[mainModel] || left === next) continue;
        const selected = lookup.faces(left);
        for (let i = 0; i < selected.length; i++) commands.despawn(selected.at(i).entity);
    }
    resources[editing] = editingOf(current.root, chain, next);
});
