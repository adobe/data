// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, System } from "@adobe/ecs";
import { selectedPaint } from "../../materials/model/index.js";
import { faceCell, faces, faceSide } from "../../selection/model/index.js";
import { editFrame, editing, Instance, lookupsOf, mainModel, material, model, paint, paintedFaces, scale, size, voxelAt } from "../../voxels/model/index.js";

/**
 * Paints each selected face of the edited model with the selected paint, which becomes its voxel's paint, covering its
 * other painted faces too; or, `remove`, takes the paint off, a voxel with no face painted left taking its own material
 * as its paint again. Returns whether any face changed, so painting faces painted already can extrude instead.
 */
export const paintSelection: System<{ readonly remove: boolean }, boolean> = System.create({
    lookup: {
        models: { with: [model, size, scale] },
        instances: { with: [...Instance] },
        voxelAt: { index: voxelAt },
        faces: { index: faces },
        painted: { with: [material, paint, paintedFaces] },
    },
}, ({ lookup, resources, commands }, input: { readonly remove: boolean }) => {
    const frame = editFrame(resources[editing], resources[mainModel], lookupsOf(lookup.models, lookup.instances));
    if (frame === null) return false;
    const coat = resources[selectedPaint];
    if (!input.remove && coat === Entity.none) return false;
    // Each voxel's paint and faces once every selected face of it is painted, so two faces of one voxel both count.
    const next = new Map<Entity, { readonly paint: Entity; readonly sides: number; readonly was: { readonly paint: Entity; readonly sides: number } }>();
    const selected = lookup.faces(frame.model);
    for (let i = 0; i < selected.length; i++) {
        const face = selected.at(i);
        const found = lookup.voxelAt(frame.model, face[faceCell]);
        const row = found === null ? null : lookup.painted(found.entity);
        if (found === null || row === null) continue;
        const was = { paint: row[paint], sides: row[paintedFaces] };
        const current = next.get(found.entity) ?? { paint: was.paint, sides: was.sides, was };
        const bit = 1 << face[faceSide];
        const sides = input.remove ? current.sides & ~bit : current.sides | bit;
        next.set(found.entity, { paint: input.remove ? sides === 0 ? row[material] : current.paint : coat, sides, was });
    }
    let changed = false;
    for (const [entity, each] of next) {
        if (each.paint !== each.was.paint) commands.add(entity, paint, each.paint);
        if (each.sides !== each.was.sides) commands.add(entity, paintedFaces, each.sides);
        changed ||= each.paint !== each.was.paint || each.sides !== each.was.sides;
    }
    return changed;
});
