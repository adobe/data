// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { faceCell, faces, faceSide, SelectedFace } from "../../../selection/model/index.js";
import { Instance, instance, instanceOf, instancesIn, material, paint, paintedFaces, parent, position, rotation, size, voxel, Voxel, voxels } from "../../../voxels/model/index.js";
import { history } from "../resource.history.js";
import { travel } from "./function.travel.js";

/**
 * A system stepping through the history, back for undo or forward for redo, sizing the models as they were and putting
 * the voxels, instances and selected faces it steps to in place of those there now.
 */
export const restoreSystem = (back: boolean): System => System.create({
    lookup: { voxels: { index: voxels }, faces: { index: faces }, instances: { index: instancesIn } },
}, ({ lookup, resources, commands }) => {
    const stepped = travel(resources[history], back, snapshot => {
        const shown = lookup.voxels();
        for (let i = 0; i < shown.length; i++) commands.despawn(shown.at(i).entity);
        const selected = lookup.faces();
        for (let i = 0; i < selected.length; i++) commands.despawn(selected.at(i).entity);
        const placed = lookup.instances();
        for (let i = 0; i < placed.length; i++) commands.despawn(placed.at(i).entity);
        const spawnInstance = commands.spawn(Instance);
        for (const each of snapshot.instances) spawnInstance({ [instance]: true, [instanceOf]: each.of, [parent]: each.parent, [position]: each.position, [rotation]: each.rotation });
        for (const each of snapshot.sizes) commands.add(each.model, size, each.size);
        const spawnVoxel = commands.spawn(Voxel);
        for (const each of snapshot.voxels) spawnVoxel({ [voxel]: true, [position]: each.cell, [material]: each.material, [paint]: each.paint, [paintedFaces]: each.painted, [parent]: each.parent });
        const spawnFace = commands.spawn(SelectedFace);
        for (const each of snapshot.faces) spawnFace({ [parent]: each.parent, [faceCell]: each.cell, [faceSide]: each.side });
    });
    if (stepped !== null) resources[history] = stepped;
});
