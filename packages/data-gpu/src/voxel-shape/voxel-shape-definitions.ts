// © 2026 Adobe. MIT License. See /LICENSE for details.

import { createTypedBuffer } from "@adobe/data/typed-buffer";
import { Boolean } from "@adobe/data/schema";
import { DenseVolume } from "@adobe/data/volume";
import type { Vec3 } from "@adobe/data/math";

const fillVolume = (
    size: Vec3,
    solid: (x: number, y: number, z: number) => boolean,
): DenseVolume<boolean> => {
    const [width, height, depth] = size;
    const data = createTypedBuffer(Boolean.schema, width * height * depth);
    const volume = DenseVolume.create({ size, data });
    for (let z = 0; z < depth; z++) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = DenseVolume.getIndex(volume, x, y, z);
                if (solid(x, y, z)) {
                    data.set(index, true);
                }
            }
        }
    }
    return volume;
};

/** Authored boolean voxel shapes — factories return fresh volumes with identical content. */
export const definitions = {
    /** Full 4³ block — reads as a plain cube when scaled to the collider. */
    solidCube: () => fillVolume([4, 4, 4], () => true),

    /** Three steps climbing along +Z. */
    stairStep: () => fillVolume([4, 4, 4], (x, y, z) => {
        const step = Math.floor(z / 2);
        return y <= step;
    }),

    /** L-shaped footprint with an exterior corner notch. */
    lCorner: () => fillVolume([4, 4, 4], (x, _y, z) => x < 3 || z < 3),

    /** Plus sign extruded vertically through the center. */
    plusBeam: () => fillVolume([4, 4, 4], (x, y, z) => {
        const onXArm = x === 1 || x === 2;
        const onZArm = z === 1 || z === 2;
        return (onXArm || onZArm) && y >= 1 && y <= 2;
    }),

    /** Hollow frame — only the outer shell is solid. */
    hollowFrame: () => fillVolume([4, 4, 4], (x, y, z) =>
        x === 0 || x === 3 || y === 0 || y === 3 || z === 0 || z === 3),

    /** Small block with a corner spur — visibly non-cubic. */
    edgeSpur: () => fillVolume([4, 4, 4], (x, y, z) => {
        if (x >= 2 && y >= 2 && z >= 2) return true;
        if (x === 0 && y === 0 && z === 0) return true;
        return false;
    }),
} as const;
