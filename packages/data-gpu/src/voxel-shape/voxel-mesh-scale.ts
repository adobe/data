// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "@adobe/data/math";
import { VOXEL_CELL_EXTENT } from "./voxel-shape-file.js";

/** Standard physics/render slot for voxel bodies — a 1³ unit cube. */
export const VOXEL_BODY_HALF_EXTENTS: Vec3 = [0.5, 0.5, 0.5];

/** Box half-extents if a grid were placed at native cell extent (authoring reference only). */
export const voxelHalfExtentsFromSize = (size: Vec3): Vec3 => [
    (size[0] * VOXEL_CELL_EXTENT) / 2,
    (size[1] * VOXEL_CELL_EXTENT) / 2,
    (size[2] * VOXEL_CELL_EXTENT) / 2,
];

/**
 * Scale a baked voxel mesh (cell-index span = grid `size` per axis) to fit a target box.
 */
export const voxelMeshScaleToHalfExtents = (volumeSize: Vec3, halfExtents: Vec3): Vec3 => [
    volumeSize[0] > 0 ? (2 * halfExtents[0]) / volumeSize[0] : 1,
    volumeSize[1] > 0 ? (2 * halfExtents[1]) / volumeSize[1] : 1,
    volumeSize[2] > 0 ? (2 * halfExtents[2]) / volumeSize[2] : 1,
];

/** Fit grid mesh into the standard 1³ dynamic-body slot. */
export const voxelMeshScaleForGridSize = (volumeSize: Vec3): Vec3 =>
    voxelMeshScaleToHalfExtents(volumeSize, VOXEL_BODY_HALF_EXTENTS);
