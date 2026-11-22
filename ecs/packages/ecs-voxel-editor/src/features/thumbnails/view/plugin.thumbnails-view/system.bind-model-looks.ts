// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, Mat4x4, System } from "@adobe/ecs";
import { baseColor, layer, Material, materialsRevision } from "../../../materials/model/index.js";
import { Instance, instancesIn, lookupsOf, material, model, modelName, models, paint, paintedFaces, placements, position, scale, size, voxels } from "../../../voxels/model/index.js";
import { modelLooks } from "../resource.model-looks.js";
import type { ModelLook } from "../internal/type.model-look.js";

/**
 * Gathers how each model looks, its own voxels and its instances' in its voxels, in their materials' colors, or in
 * paint mode their paints' where a face is painted, after a pass in which voxels, instances or models came or went, a material was edited, or
 * the mode changed.
 */
export const bindModelLooks: System = System.create({
    resources: { changed: [materialsRevision, layer] },
    lookup: {
        all: { index: models, changed: true },
        voxels: { index: voxels, changed: true },
        placed: { index: instancesIn, changed: true },
        models: { with: [model, size, scale] },
        instances: { with: [...Instance] },
        materials: { with: [...Material] },
    },
}, ({ lookup, resources }) => {
    const lookups = { ...lookupsOf(lookup.models, lookup.instances), instancesIn: (holder: Entity) => {
        const list = lookup.placed(holder);
        const found: Entity[] = [];
        for (let i = 0; i < list.length; i++) found.push(list.at(i).entity);
        return found;
    } };
    const looks = new Map<Entity, ModelLook>();
    const all = lookup.all();
    for (let i = 0; i < all.length; i++) {
        const row = all.at(i);
        const own = Mat4x4.scaling(row[scale][0], row[scale][1], row[scale][2]);
        const back = Mat4x4.inverse(own);
        const cubes: { at: readonly [number, number, number]; across: number; color: string }[] = [];
        for (const placed of placements(row.entity, lookups, 4)) {
            // Into this model's voxels: from the placed model's to the world, then back.
            const into = Mat4x4.multiply(back, placed.toWorld);
            const across = Math.cbrt(Math.abs(Mat4x4.determinant(into)));
            const shown = lookup.voxels(placed.model);
            for (let k = 0; k < shown.length; k++) {
                const cell = shown.at(k)[position];
                const [x, y, z] = Mat4x4.multiplyVec4(into, [cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.5, 1]);
                const color = lookup.materials(shown.at(k)[resources[layer] === "paint" && shown.at(k)[paintedFaces] !== 0 ? paint : material])?.[baseColor] ?? [1, 0, 1, 1];
                cubes.push({ at: [x, y, z], across, color: `rgb(${channel(color[0])} ${channel(color[1])} ${channel(color[2])})` });
            }
        }
        looks.set(row.entity, { name: row[modelName], size: [row[size][0], row[size][1], row[size][2]], cubes });
    }
    resources[modelLooks] = looks;
});

/** A linear color channel, from 0 to 1, as an sRGB byte. */
const channel = (linear: number): number => Math.round(255 * Math.min(Math.max(linear, 0), 1) ** (1 / 2.2));
