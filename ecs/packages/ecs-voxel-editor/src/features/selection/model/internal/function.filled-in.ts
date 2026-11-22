// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec3 } from "@adobe/ecs";

/** Whether a cell is filled, in a model of `size` voxels where `voxelAt` says which hold one: those outside it are. */
export const filledIn = (size: Vec3, voxelAt: (cell: Vec3) => boolean) => (x: number, y: number, z: number): boolean =>
    x < 0 || y < 0 || z < 0 || x >= size[0] || y >= size[1] || z >= size[2] || voxelAt([x, y, z]);
