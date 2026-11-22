// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { faceCell, faces, faceSide, normalOf } from "../../selection/model/index.js";
import { editFrame, editing, Instance, lookupsOf, mainModel, model, scale, size, voxelAt } from "../../voxels/model/index.js";

/**
 * Empties the cell behind every selected face of the model being edited, despawning its voxel, and moves the face back
 * one voxel, onto the side of the cell behind facing the same way, through empty cells and other faces alike, each
 * staying a face of its own. A face of the model's walls stays.
 */
export const deleteSelection: System = System.create({
    lookup: { models: { with: [model, size, scale] }, instances: { with: [...Instance] }, voxelAt: { index: voxelAt }, faces: { index: faces } },
}, ({ lookup, commands, resources }) => {
    const frame = editFrame(resources[editing], resources[mainModel], lookupsOf(lookup.models, lookup.instances));
    if (frame === null) return;
    const bounds = frame.size;
    const emptied = new Set<string>();
    const selected = lookup.faces(frame.model);
    for (let i = 0; i < selected.length; i++) {
        const row = selected.at(i);
        const [x, y, z] = row[faceCell];
        if (x < 0 || y < 0 || z < 0 || x >= bounds[0] || y >= bounds[1] || z >= bounds[2]) continue;
        const cell = `${x},${y},${z}`;
        const filled = lookup.voxelAt(frame.model, [x, y, z]);
        if (filled !== null && !emptied.has(cell)) {
            emptied.add(cell);
            commands.despawn(filled.entity);
        }
        const [nx, ny, nz] = normalOf(row[faceSide]);
        commands.add(row.entity, faceCell, [x - nx, y - ny, z - nz]);
    }
});
