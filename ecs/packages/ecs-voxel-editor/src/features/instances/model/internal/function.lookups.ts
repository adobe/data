// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity, Quat, Vec3 } from "@adobe/ecs";
import { instanceOf, lookupsOf, type Lookups, parent, position, rotation, scale, size } from "../../../voxels/model/index.js";

/** A list as an index lookup gives one. */
type List = { readonly length: number; readonly at: (index: number) => { readonly entity: Entity } };

/** What picking an instance looks up, from a system's lookups: models, instances, those placed in a model, and filled cells. */
export const lookups = (
    models: (entity: Entity) => { readonly [size]: Vec3; readonly [scale]: Vec3 } | null,
    instances: (entity: Entity) => { readonly [instanceOf]: Entity; readonly [parent]: Entity; readonly [position]: Vec3; readonly [rotation]: Quat } | null,
    placed: (model: Entity) => List,
    voxelAt: (model: Entity, cell: Vec3) => unknown,
): Lookups & { readonly instancesIn: (model: Entity) => readonly Entity[]; readonly filled: (model: Entity, cell: Vec3) => boolean } => ({
    ...lookupsOf(models, instances),
    instancesIn: model => {
        const list = placed(model);
        const found: Entity[] = [];
        for (let i = 0; i < list.length; i++) found.push(list.at(i).entity);
        return found;
    },
    filled: (model, cell) => voxelAt(model, cell) !== null,
});
