// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { fitBoneCapsules, type SkinVertices } from "./fit-bone-capsules.js";

const IDENTITY_IBM = (n: number) => {
    const m = new Float32Array(n * 16);
    for (let j = 0; j < n; j++) { m[j * 16] = 1; m[j * 16 + 5] = 1; m[j * 16 + 10] = 1; m[j * 16 + 15] = 1; }
    return m;
};

/** 8 corners of a box, all dominantly weighted to `joint`. */
function boxCorners(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, joint: number) {
    const pos: number[] = [], jn: number[] = [], wt: number[] = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        pos.push(cx + sx * hx, cy + sy * hy, cz + sz * hz);
        jn.push(joint, 0, 0, 0); wt.push(1, 0, 0, 0);
    }
    return { pos, jn, wt };
}

const skinFrom = (...parts: { pos: number[]; jn: number[]; wt: number[] }[]): SkinVertices => ({
    positions: new Float32Array(parts.flatMap(p => p.pos)),
    joints: new Uint32Array(parts.flatMap(p => p.jn)),
    weights: new Float32Array(parts.flatMap(p => p.wt)),
});

// rotate (0,1,0) by a quaternion
const rotateUp = (q: readonly number[]): [number, number, number] => {
    const [x, y, z, w] = q;
    return [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
};

describe("fitBoneCapsules", () => {
    it("fits an X-elongated bone to an X-axis capsule of the right size", () => {
        // box x∈[-2,2], y∈[-0.5,0.5], z∈[-0.4,0.4] → axis X, radius ½·max(1,0.8)=0.5, halfHeight 2−0.5=1.5
        const caps = fitBoneCapsules({ jointCount: 1, inverseBindMatrices: IDENTITY_IBM(1), skin: skinFrom(boxCorners(0, 0, 0, 2, 0.5, 0.4, 0)) });
        expect(caps).toHaveLength(1);
        const c = caps[0];
        expect(c.jointIndex).toBe(0);
        expect(c.radius).toBeCloseTo(0.5);
        expect(c.halfHeight).toBeCloseTo(1.5);
        expect(c.offsetPosition[0]).toBeCloseTo(0);
        // the capsule's local +Y, rotated by the offset, points along world X (the fit axis)
        const up = rotateUp(c.offsetRotation);
        expect(Math.abs(up[0])).toBeCloseTo(1);
        expect(Math.abs(up[1])).toBeCloseTo(0);
    });

    it("fits one capsule per bone, grouping vertices by dominant weight", () => {
        const caps = fitBoneCapsules({
            jointCount: 2, inverseBindMatrices: IDENTITY_IBM(2),
            skin: skinFrom(boxCorners(0, 0, 0, 1, 0.3, 0.3, 0), boxCorners(0, 5, 0, 0.3, 1, 0.3, 1)),
        });
        expect(caps.map(c => c.jointIndex).sort()).toEqual([0, 1]);
        // bone 1 is Y-elongated → its capsule axis is Y (offset rotation ≈ identity)
        const c1 = caps.find(c => c.jointIndex === 1)!;
        expect(rotateUp(c1.offsetRotation)[1]).toBeCloseTo(1);
        expect(c1.offsetPosition[1]).toBeCloseTo(5);
    });

    it("skips bones with too few assigned vertices", () => {
        const sparse = { pos: [0, 0, 0, 1, 0, 0, 2, 0, 0], jn: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], wt: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] };
        expect(fitBoneCapsules({ jointCount: 1, inverseBindMatrices: IDENTITY_IBM(1), skin: skinFrom(sparse) })).toHaveLength(0);
    });
});
