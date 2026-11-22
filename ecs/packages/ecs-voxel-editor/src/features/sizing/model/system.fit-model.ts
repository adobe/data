// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System } from "@adobe/ecs";
import { camera } from "../../camera/model/index.js";
import { faces } from "../../selection/model/index.js";
import { editing, instanceOf, instancesIn, instancesOf, model, position, scale, size, voxels } from "../../voxels/model/index.js";
import { reframe } from "./function.reframe.js";
import { reframingOf } from "./function.reframing-of.js";
import { cameraFollows } from "./function.camera-follows.js";

/**
 * Sizes a model to its contents, its voxels and the instances in it, moving them toward its origin so they run from 0 in
 * each direction; a model with none keeps its size.
 */
export const fitModel: System<{ readonly model: Entity }> = System.create({
    lookup: { voxels: { index: voxels }, placed: { index: instancesIn }, faces: { index: faces }, placements: { index: instancesOf }, models: { with: [model, size, scale] } },
}, ({ lookup, commands, resources }, input: { readonly model: Entity }) => {
    const row = lookup.models(input.model);
    if (row === null) return;
    const low = [Infinity, Infinity, Infinity];
    const high = [-Infinity, -Infinity, -Infinity];
    const include = (from: ArrayLike<number>, to: ArrayLike<number>): void => {
        for (let axis = 0; axis < 3; axis++) {
            low[axis] = Math.min(low[axis] ?? 0, Math.floor(from[axis] ?? 0));
            high[axis] = Math.max(high[axis] ?? 0, Math.ceil(to[axis] ?? 0));
        }
    };
    const filled = lookup.voxels(input.model);
    for (let i = 0; i < filled.length; i++) {
        const at = filled.at(i)[position];
        include(at, [at[0] + 1, at[1] + 1, at[2] + 1]);
    }
    const placed = lookup.placed(input.model);
    for (let i = 0; i < placed.length; i++) {
        const at = placed.at(i)[position];
        const inner = lookup.models(placed.at(i)[instanceOf]);
        // An instance reaches as far as its model, in this model's voxels: its bounds, unturned.
        const reach = inner === null ? [1, 1, 1] : [0, 1, 2].map(axis => (inner[size][axis] ?? 1) * (inner[scale][axis] ?? 1) / (row[scale][axis] ?? 1));
        include(at, [at[0] + (reach[0] ?? 1), at[1] + (reach[1] ?? 1), at[2] + (reach[2] ?? 1)]);
    }
    if (low[0] === Infinity) return;
    const shift: [number, number, number] = [-(low[0] ?? 0), -(low[1] ?? 0), -(low[2] ?? 0)];
    const across = (axis: number): number => Math.max(1, (high[axis] ?? 1) - (low[axis] ?? 0));
    const extent: [number, number, number] = [across(0), across(1), across(2)];
    const reframing = reframingOf(input.model, {
        voxels: holder => lookup.voxels(holder), placed: holder => lookup.placed(holder), faces: holder => lookup.faces(holder),
        placements: held => lookup.placements(held), scaleOf: held => lookup.models(held)?.[scale] ?? null,
    });
    reframe(commands, reframing, shift, extent);
    resources[camera] = cameraFollows(resources[camera], resources[editing], input.model, shift, row[scale]);
});
