// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "../../math/index.js";
import type { TypedBuffer } from "../../typed-buffer/typed-buffer.js";
import type { Callback } from "./callback.js";
import { getDenseIndex } from "./volume-index.js";
export {
    iterateSparseBlockAxis,
    buildSparseBlockAxisPlan,
    runSparseBlockAxisPlan,
    runSparseBlockAxisPlanView,
    runSparseBlockAxisPlanBatch,
    type SparseBlockAxisPlan,
} from "./iterate-sparse-block-axis.js";

export type IterateAxis = "x" | "y" | "z";

interface DenseAxisSpec {
    readonly length: number;
    readonly step: number;
    readonly outer: readonly [number, number];
    readonly segmentStart: (size: Vec3, a: number, b: number) => number;
    readonly origin: (a: number, b: number) => readonly [number, number, number];
    readonly isLast: (a: number, b: number, lastA: number, lastB: number) => boolean;
}

const denseAxisSpecs: Record<IterateAxis, (size: Vec3) => DenseAxisSpec> = {
    x: (size) => {
        const [width, height, depth] = size;
        return {
            length: width,
            step: 1,
            outer: [depth, height] as const,
            segmentStart: (s, y, z) => getDenseIndex(s, 0, y, z),
            origin: (y, z) => [0, y, z] as const,
            isLast: (y, z, lastY, lastZ) => y === lastY && z === lastZ,
        };
    },
    y: (size) => {
        const [width, height, depth] = size;
        return {
            length: height,
            step: width,
            outer: [depth, width] as const,
            segmentStart: (s, x, z) => getDenseIndex(s, x, 0, z),
            origin: (x, z) => [x, 0, z] as const,
            isLast: (x, z, lastX, lastZ) => x === lastX && z === lastZ,
        };
    },
    z: (size) => {
        const [width, height, depth] = size;
        const plane = width * height;
        return {
            length: depth,
            step: plane,
            outer: [height, width] as const,
            segmentStart: (s, x, y) => getDenseIndex(s, x, y, 0),
            origin: (x, y) => [x, y, 0] as const,
            isLast: (x, y, lastX, lastY) => x === lastX && y === lastY,
        };
    },
};

export const iterateDenseAxis = <T>(
    size: Vec3,
    data: TypedBuffer<T>,
    callback: Callback<T>,
    axis: IterateAxis,
): void => {
    const [width, height, depth] = size;
    if (width === 0 || height === 0 || depth === 0) {
        return;
    }

    const spec = denseAxisSpecs[axis](size);
    const [outerCount, innerCount] = spec.outer;
    const segments = [0, spec.length];
    const lastOuter = outerCount - 1;
    const lastInner = innerCount - 1;

    for (let outer = 0; outer < outerCount; outer++) {
        for (let inner = 0; inner < innerCount; inner++) {
            segments[0] = spec.segmentStart(size, inner, outer);
            const [x, y, z] = spec.origin(inner, outer);
            callback(
                data,
                segments,
                spec.step,
                x,
                y,
                z,
                spec.isLast(inner, outer, lastInner, lastOuter),
            );
        }
    }
};
