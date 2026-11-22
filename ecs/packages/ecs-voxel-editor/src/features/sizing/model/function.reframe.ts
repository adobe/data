// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Quat, type System, type Vec3 } from "@adobe/ecs";
import { faceCell } from "../../selection/model/index.js";
import { position, size } from "../../voxels/model/index.js";
import type { Reframing } from "./internal/type.reframing.js";

/**
 * Moves a model's contents by `shift` voxels and gives it `extent`: its voxels, instances and selected faces move, and
 * a voxel left outside it goes; each instance placing it moves the other way, so the model stays where it was drawn.
 */
export const reframe = (commands: System.Commands, reframing: Reframing, shift: Vec3.I32, extent: Vec3.I32): void => {
    const [dx, dy, dz] = shift;
    const moved = dx !== 0 || dy !== 0 || dz !== 0;
    for (const each of reframing.voxels) {
        const at: [number, number, number] = [each.position[0] + dx, each.position[1] + dy, each.position[2] + dz];
        if (at.some((value, axis) => value < 0 || value >= (extent[axis] ?? 0))) commands.despawn(each.entity);
        else if (moved) commands.add(each.entity, position, at);
    }
    if (moved) {
        for (const each of reframing.placed) commands.add(each.entity, position, [each.position[0] + dx, each.position[1] + dy, each.position[2] + dz]);
        for (const each of reframing.faces) commands.add(each.entity, faceCell, [each.cell[0] + dx, each.cell[1] + dy, each.cell[2] + dz]);
        const scaled: Vec3 = [dx * reframing.scale[0], dy * reframing.scale[1], dz * reframing.scale[2]];
        for (const each of reframing.placements) {
            const turned = Quat.rotateVec3(each.rotation, scaled);
            commands.add(each.entity, position, [
                each.position[0] - turned[0] / each.parentScale[0],
                each.position[1] - turned[1] / each.parentScale[1],
                each.position[2] - turned[2] / each.parentScale[2],
            ]);
        }
    }
    commands.add(reframing.model, size, [extent[0], extent[1], extent[2]]);
};
