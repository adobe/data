// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, System, type Vec3 } from "@adobe/ecs";
import { faces } from "../../selection/model/index.js";
import { instancesIn, instancesOf, model, scale, size, voxels } from "../../voxels/model/index.js";
import { reframe } from "./function.reframe.js";
import { reframingOf } from "./function.reframing-of.js";

/** Sizes a model again, `size` voxels each way, from 1 to 256, its contents where they are; voxels left outside it go. */
export const resizeModel: System<{ readonly model: Entity; readonly size: Vec3.I32 }> = System.create({
    lookup: { voxels: { index: voxels }, placed: { index: instancesIn }, faces: { index: faces }, placements: { index: instancesOf }, models: { with: [model, size, scale] } },
}, ({ lookup, commands }, input: { readonly model: Entity; readonly size: Vec3.I32 }) => {
    const row = lookup.models(input.model);
    if (row === null) return;
    const extent: [number, number, number] = [clamp(input.size[0]), clamp(input.size[1]), clamp(input.size[2])];
    if (extent.every((value, axis) => value === row[size][axis])) return;
    const reframing = reframingOf(input.model, {
        voxels: holder => lookup.voxels(holder), placed: holder => lookup.placed(holder), faces: holder => lookup.faces(holder),
        placements: held => lookup.placements(held), scaleOf: held => lookup.models(held)?.[scale] ?? null,
    });
    reframe(commands, reframing, [0, 0, 0], extent);
});

/** A size along one axis, a whole number of voxels from 1 to 256. */
const clamp = (value: number): number => Math.min(256, Math.max(1, Math.round(value)));
