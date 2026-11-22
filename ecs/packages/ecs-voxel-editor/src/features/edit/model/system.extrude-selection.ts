// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, Quat, System, type Vec3 } from "@adobe/ecs";
import { camera } from "../../camera/model/index.js";
import { layer, selectedMaterial, selectedPaint } from "../../materials/model/index.js";
import { faceCell, faces, faceSide, normalOf } from "../../selection/model/index.js";
import { cameraFollows, reframe, reframingOf } from "../../sizing/model/index.js";
import {
    contains, editFrame, editing, Instance, instance, instanceOf, instancesIn, instancesOf, lookupsOf, mainModel, material, model, paint, paintedFaces, parent,
    position, rotation, scale, size, sizeUnlocked, Voxel, voxel, voxelAt, voxels,
} from "../../voxels/model/index.js";
import { paintModel } from "./resource.paint-model.js";

/**
 * Moves every selected face of the model being edited out the way it faces, filling what it passes: one voxel of the
 * selected material, or, painting with a model, an instance of it, the face then stepping as far as the model reaches
 * across the edited model's voxels. A face moves on through filled cells and other faces, each staying a face of its
 * own. Past the model's bounds, a face stays where its size is locked; where it's unlocked, the model grows to hold
 * what's filled, its contents moving up from 0 where it grows the negative way, and the view with them. A model can't
 * be placed within itself. In paint mode, a face fills with the material it's a face of, or the selected one where it
 * has none, painted on every side with the selected paint.
 */
export const extrudeSelection: System = System.create({
    lookup: {
        models: { with: [model, size, scale], optional: [sizeUnlocked] },
        instances: { with: [...Instance] },
        placed: { index: instancesIn },
        placements: { index: instancesOf },
        voxels: { index: voxels },
        voxelAt: { index: voxelAt },
        faces: { index: faces },
    },
}, ({ lookup, resources, commands }) => {
    const frame = editFrame(resources[editing], resources[mainModel], lookupsOf(lookup.models, lookup.instances));
    if (frame === null) return;
    const bounds = frame.size;
    const unlocked = lookup.models(frame.model)?.[sizeUnlocked] === true;
    // Painting, a face extrudes the material it's a face of, painted all over.
    const coating = resources[layer] === "paint";
    const painting = coating ? null : paintable(resources[paintModel], frame.model, held => lookup.models(held), holder => {
        const list = lookup.placed(holder);
        const found: Entity[] = [];
        for (let i = 0; i < list.length; i++) found.push(list.at(i)[instanceOf]);
        return found;
    });
    const fill = resources[selectedMaterial];
    const coat = resources[selectedPaint];
    if (coating ? coat === Entity.none : painting === null && fill === Entity.none) return;
    // Where each face fills, and moves to, in the model's voxels as they are now.
    const fills: { readonly face: Entity; readonly at: Vec3.I32; readonly reach: Vec3.I32; readonly to: Vec3.I32; readonly filling: Entity }[] = [];
    const selected = lookup.faces(frame.model);
    for (let i = 0; i < selected.length; i++) {
        const row = selected.at(i);
        const [x, y, z] = row[faceCell];
        const normal = normalOf(row[faceSide]);
        const axis = row[faceSide] >> 1;
        const step = painting === null ? 1 : Math.max(1, Math.ceil(painting.extent[axis] / frame.scale[axis] - 1e-6));
        // The instance's origin is its lowest corner, so one placed the negative way starts `step` back.
        const at: [number, number, number] = [x + normal[0], y + normal[1], z + normal[2]];
        if (normal[axis] < 0) at[axis] = (at[axis] ?? 0) - step + 1;
        const reach: [number, number, number] = [at[0], at[1], at[2]];
        reach[axis] = (at[axis] ?? 0) + step - 1;
        const inside = [0, 1, 2].every(each => (at[each] ?? 0) >= 0 && (reach[each] ?? 0) < (bounds[each] ?? 0));
        if (!inside && !unlocked) continue;
        const filling = coating ? lookup.voxelAt(frame.model, row[faceCell])?.[material] ?? fill : fill;
        fills.push({ face: row.entity, at, reach, to: [x + normal[0] * step, y + normal[1] * step, z + normal[2] * step], filling });
    }
    // An unlocked model grows to hold every fill, its contents moving by `shift` where it grows the negative way.
    const shift: [number, number, number] = [0, 0, 0];
    const extent: [number, number, number] = [bounds[0], bounds[1], bounds[2]];
    for (const each of fills) {
        for (let axis = 0; axis < 3; axis++) {
            shift[axis] = Math.max(shift[axis] ?? 0, -(each.at[axis] ?? 0));
            extent[axis] = Math.max(extent[axis] ?? 0, (each.reach[axis] ?? 0) + 1);
        }
    }
    const grown: [number, number, number] = [extent[0] + shift[0], extent[1] + shift[1], extent[2] + shift[2]];
    if (grown.some((value, axis) => value !== bounds[axis])) {
        reframe(commands, reframingOf(frame.model, {
            voxels: holder => lookup.voxels(holder), placed: holder => lookup.placed(holder), faces: holder => lookup.faces(holder),
            placements: held => lookup.placements(held), scaleOf: held => lookup.models(held)?.[scale] ?? null,
        }), shift, grown);
        resources[camera] = cameraFollows(resources[camera], resources[editing], frame.model, shift, frame.scale);
    }
    const moved = (cell: Vec3.I32): [number, number, number] => [cell[0] + shift[0], cell[1] + shift[1], cell[2] + shift[2]];
    const spawnVoxel = commands.spawn(Voxel);
    const spawnInstance = commands.spawn(Instance);
    const filling = new Set<string>();
    for (const each of fills) {
        const key = `${each.at[0]},${each.at[1]},${each.at[2]}`;
        if (!filling.has(key)) {
            filling.add(key);
            if (painting !== null) {
                spawnInstance({ [instance]: true, [instanceOf]: painting.model, [parent]: frame.model, [position]: moved(each.at), [rotation]: Quat.identity });
            } else if (lookup.voxelAt(frame.model, each.at) === null) {
                spawnVoxel({
                    [voxel]: true, [position]: moved(each.at), [material]: each.filling, [parent]: frame.model,
                    ...coating ? { [paint]: coat, [paintedFaces]: allFaces } : { [paint]: each.filling, [paintedFaces]: 0 },
                });
            }
        }
        commands.add(each.face, faceCell, moved(each.to));
    }
});

/** The model to paint with, and its extent in world units, or null to fill voxels: none, or one that would hold `holder`. */
const paintable = (
    painted: Entity,
    holder: Entity,
    modelOf: (model: Entity) => { readonly [size]: Vec3; readonly [scale]: Vec3 } | null,
    placedIn: (model: Entity) => readonly Entity[],
): { readonly model: Entity; readonly extent: Vec3 } | null => {
    const row = painted === Entity.none ? null : modelOf(painted);
    if (row === null || contains(painted, holder, placedIn)) return null;
    return { model: painted, extent: [row[size][0] * row[scale][0], row[size][1] * row[scale][1], row[size][2] * row[scale][2]] };
};

/** Every face of a voxel painted. */
const allFaces = 0b111111;
