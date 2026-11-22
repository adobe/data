// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity, Quat, Vec3 } from "@adobe/ecs";
import { faceCell } from "../../selection/model/index.js";
import { parent, position, rotation, scale } from "../../voxels/model/index.js";
import type { Reframing } from "./internal/type.reframing.js";

/** A list as an index lookup gives one. */
type List<R> = { readonly length: number; readonly at: (index: number) => R & { readonly entity: Entity } };

/** What reframing `model` touches, from a system's lookups of its voxels, instances, faces and placements, and models' scale. */
export const reframingOf = (model: Entity, lookups: {
    readonly voxels: (model: Entity) => List<{ readonly [position]: Vec3 }>;
    readonly placed: (model: Entity) => List<{ readonly [position]: Vec3 }>;
    readonly faces: (model: Entity) => List<{ readonly [faceCell]: Vec3.I32 }>;
    readonly placements: (model: Entity) => List<{ readonly [position]: Vec3; readonly [rotation]: Quat; readonly [parent]: Entity }>;
    readonly scaleOf: (model: Entity) => Vec3 | null;
}): Reframing => {
    const rows = <R, T>(list: List<R>, map: (row: R & { readonly entity: Entity }) => T): T[] => {
        const found: T[] = [];
        for (let i = 0; i < list.length; i++) found.push(map(list.at(i)));
        return found;
    };
    return {
        model,
        scale: lookups.scaleOf(model) ?? [1, 1, 1],
        voxels: rows(lookups.voxels(model), row => ({ entity: row.entity, position: row[position] })),
        placed: rows(lookups.placed(model), row => ({ entity: row.entity, position: row[position] })),
        faces: rows(lookups.faces(model), row => ({ entity: row.entity, cell: row[faceCell] })),
        placements: rows(lookups.placements(model), row => ({
            entity: row.entity, position: row[position], rotation: row[rotation], parentScale: lookups.scaleOf(row[parent]) ?? [1, 1, 1],
        })),
    };
};
