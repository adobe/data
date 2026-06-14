// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import {
    VOXEL_BODY_HALF_EXTENTS,
    voxelHalfExtentsFromSize,
    voxelMeshScaleForGridSize,
    voxelMeshScaleToHalfExtents,
} from "./voxel-mesh-scale.js";

describe("voxel grid fit to unit cube", () => {
    it("uses fixed 0.5 halfExtents for all voxel bodies", () => {
        expect(VOXEL_BODY_HALF_EXTENTS).toEqual([0.5, 0.5, 0.5]);
    });

    it("scales 4³ grid mesh into the 1³ body slot", () => {
        const scale = voxelMeshScaleForGridSize([4, 4, 4]);
        expect(scale).toEqual([0.25, 0.25, 0.25]);
        expect(4 * scale[0]!).toBeCloseTo(2 * VOXEL_BODY_HALF_EXTENTS[0]!);
    });

    it("scales non-uniform grids independently per axis", () => {
        const scale = voxelMeshScaleForGridSize([2, 4, 8]);
        expect(scale).toEqual([0.5, 0.25, 0.125]);
    });

    it("scales static colliders to authored halfExtents", () => {
        const scale = voxelMeshScaleToHalfExtents([4, 4, 4], [10, 0.5, 10]);
        expect(scale).toEqual([5, 0.25, 5]);
    });
});
