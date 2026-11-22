// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Mat4x4, Quat, type Vec3 } from "@adobe/ecs";

/**
 * The matrix taking a placed model's voxels to those of the model it's placed in: scaled by its voxels' world size,
 * turned by `rotation`, shrunk to the parent's voxels and moved to `position` in them.
 */
export const instanceMatrix = (position: Vec3, rotation: Quat, childScale: Vec3, parentScale: Vec3): Mat4x4 =>
    Mat4x4.multiply(
        Mat4x4.multiply(Mat4x4.translation(position[0], position[1], position[2]), Mat4x4.scaling(1 / parentScale[0], 1 / parentScale[1], 1 / parentScale[2])),
        Mat4x4.multiply(Quat.toMat4(rotation), Mat4x4.scaling(childScale[0], childScale[1], childScale[2])),
    );
