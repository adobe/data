// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { TypedBuffer } from "../../typed-buffer/typed-buffer.js";
import type { Callback } from "./callback.js";
import type { IterateAxis } from "./iterate-axis.js";
import { localBlockIndex } from "./volume-index.js";
import { packPlaneKey } from "./create-sparse-block/pack-block-key.js";
import { unpackBlockKey } from "./create-sparse-block/unpack-block-key.js";

/** Flat block record: vary, bx, by, bz, offset */
const BLOCK_STRIDE = 5;

/** groupIndex, inner, runStart, runEnd (block indices within the group) */
const STEP_STRIDE = 4;

interface AxisLayout {
    readonly step: number;
    readonly groupKey: (bx: number, by: number, bz: number) => number;
    readonly vary: (bx: number, by: number, bz: number) => number;
    readonly segmentOffset: (offset: number, la: number, lb: number, blockSize: number, blockVolume: number) => number;
}

const axisLayouts: Record<IterateAxis, AxisLayout> = {
    x: {
        step: 1,
        groupKey: (_bx, by, bz) => packPlaneKey(bz, by),
        vary: (bx) => bx,
        segmentOffset: (offset, ly, lz, blockSize, blockVolume) =>
            offset + ly * blockSize + lz * blockVolume,
    },
    y: {
        step: 0,
        groupKey: (bx, _by, bz) => packPlaneKey(bz, bx),
        vary: (_bx, by) => by,
        segmentOffset: (offset, lx, lz, _blockSize, blockVolume) =>
            offset + lx + lz * blockVolume,
    },
    z: {
        step: 0,
        groupKey: (bx, by) => packPlaneKey(by, bx),
        vary: (_bx, _by, bz) => bz,
        segmentOffset: (offset, lx, ly, blockSize) =>
            offset + localBlockIndex(lx, ly, 0, blockSize),
    },
};

export interface SparseBlockAxisPlan {
    readonly axis: IterateAxis;
    readonly blockSize: number;
    readonly step: number;
    readonly segments: number[];
    readonly precomputedSegments: readonly number[];
    readonly stepSegmentStarts: readonly number[];
    readonly origins: readonly number[];
    readonly callbackCount: number;
    readonly maxSegmentLength: number;
}

const sortBlocksByVary = (blocks: number[], blockCount: number): void => {
    if (blockCount < 2) {
        return;
    }
    const order = new Array<number>(blockCount);
    for (let i = 0; i < blockCount; i++) {
        order[i] = i;
    }
    order.sort((a, b) => blocks[a * BLOCK_STRIDE]! - blocks[b * BLOCK_STRIDE]!);
    const temp = blocks.slice(0, blockCount * BLOCK_STRIDE);
    for (let i = 0; i < blockCount; i++) {
        const src = order[i]! * BLOCK_STRIDE;
        const dst = i * BLOCK_STRIDE;
        for (let k = 0; k < BLOCK_STRIDE; k++) {
            blocks[dst + k] = temp[src + k]!;
        }
    }
};

const appendAdjacentRuns = (
    groupIndex: number,
    inner: number,
    blocks: readonly number[],
    blockCount: number,
    steps: number[],
): void => {
    if (blockCount === 0) {
        return;
    }
    let runStart = 0;
    for (let i = 1; i <= blockCount; i++) {
        if (i === blockCount || blocks[i * BLOCK_STRIDE]! !== blocks[(i - 1) * BLOCK_STRIDE]! + 1) {
            steps.push(groupIndex, inner, runStart, i);
            runStart = i;
        }
    }
};

const writeOrigin = (
    axis: IterateAxis,
    shift: number,
    bx: number,
    by: number,
    bz: number,
    la: number,
    lb: number,
    origins: number[],
    stepIndex: number,
): void => {
    const base = stepIndex * 3;
    if (axis === "x") {
        origins[base] = bx << shift;
        origins[base + 1] = (by << shift) + la;
        origins[base + 2] = (bz << shift) + lb;
        return;
    }
    if (axis === "y") {
        origins[base] = (bx << shift) + la;
        origins[base + 1] = by << shift;
        origins[base + 2] = (bz << shift) + lb;
        return;
    }
    origins[base] = (bx << shift) + la;
    origins[base + 1] = (by << shift) + lb;
    origins[base + 2] = bz << shift;
};

export const buildSparseBlockAxisPlan = (
    blocks: ReadonlyMap<number, number>,
    blockSize: number,
    shift: number,
    axis: IterateAxis,
): SparseBlockAxisPlan | undefined => {
    if (blocks.size === 0) {
        return undefined;
    }

    const blockVolume = blockSize * blockSize * blockSize;
    const blockPlane = blockSize * blockSize;
    const layout = axisLayouts[axis];
    const step = axis === "x" ? 1 : axis === "y" ? blockSize : blockPlane;

    const groups = new Map<number, number[]>();
    for (const [key, offset] of blocks) {
        const { bx, by, bz } = unpackBlockKey(key);
        const groupKey = layout.groupKey(bx, by, bz);
        let group = groups.get(groupKey);
        if (group === undefined) {
            group = [];
            groups.set(groupKey, group);
        }
        const base = group.length;
        group.length = base + BLOCK_STRIDE;
        group[base] = layout.vary(bx, by, bz);
        group[base + 1] = bx;
        group[base + 2] = by;
        group[base + 3] = bz;
        group[base + 4] = offset;
    }

    const groupKeys: number[] = [];
    for (const key of groups.keys()) {
        groupKeys.push(key);
    }
    groupKeys.sort((a, b) => a - b);

    const sortedGroups: number[][] = [];
    const steps: number[] = [];
    for (const key of groupKeys) {
        const groupBlocks = groups.get(key)!;
        const blockCount = groupBlocks.length / BLOCK_STRIDE;
        sortBlocksByVary(groupBlocks, blockCount);
        sortedGroups.push(groupBlocks);
    }

    for (let groupIndex = 0; groupIndex < sortedGroups.length; groupIndex++) {
        const groupBlocks = sortedGroups[groupIndex]!;
        const blockCount = groupBlocks.length / BLOCK_STRIDE;
        for (let inner = 0; inner < blockPlane; inner++) {
            appendAdjacentRuns(groupIndex, inner, groupBlocks, blockCount, steps);
        }
    }

    const callbackCount = steps.length / STEP_STRIDE;
    const stepSegmentStarts = new Array<number>(callbackCount + 1);
    const precomputedSegments: number[] = [];
    const origins = new Array<number>(callbackCount * 3);

    for (let stepIndex = 0, s = 0; stepIndex < callbackCount; stepIndex++, s += STEP_STRIDE) {
        const groupBlocks = sortedGroups[steps[s]!]!;
        const inner = steps[s + 1]!;
        const runStart = steps[s + 2]!;
        const runEnd = steps[s + 3]!;
        const la = inner % blockSize;
        const lb = (inner / blockSize) | 0;

        stepSegmentStarts[stepIndex] = precomputedSegments.length;
        for (let i = runStart; i < runEnd; i++) {
            const base = i * BLOCK_STRIDE;
            precomputedSegments.push(
                layout.segmentOffset(groupBlocks[base + 4]!, la, lb, blockSize, blockVolume),
                blockSize,
            );
        }

        const first = runStart * BLOCK_STRIDE;
        writeOrigin(
            axis,
            shift,
            groupBlocks[first + 1]!,
            groupBlocks[first + 2]!,
            groupBlocks[first + 3]!,
            la,
            lb,
            origins,
            stepIndex,
        );
    }
    stepSegmentStarts[callbackCount] = precomputedSegments.length;

    let maxSegmentLength = 0;
    for (let stepIndex = 0; stepIndex < callbackCount; stepIndex++) {
        const length = stepSegmentStarts[stepIndex + 1]! - stepSegmentStarts[stepIndex]!;
        if (length > maxSegmentLength) {
            maxSegmentLength = length;
        }
    }

    return {
        axis,
        blockSize,
        step,
        segments: maxSegmentLength > 0 ? new Array(maxSegmentLength) : [],
        precomputedSegments,
        stepSegmentStarts,
        origins,
        callbackCount,
        maxSegmentLength,
    };
};

export const runSparseBlockAxisPlan = <T>(
    plan: SparseBlockAxisPlan,
    _shift: number,
    data: TypedBuffer<T>,
    callback: Callback<T>,
): void => {
    const { step, segments, precomputedSegments, stepSegmentStarts, origins, callbackCount } = plan;
    const lastStep = callbackCount - 1;

    for (let stepIndex = 0; stepIndex < callbackCount; stepIndex++) {
        const segmentStart = stepSegmentStarts[stepIndex]!;
        const segmentEnd = stepSegmentStarts[stepIndex + 1]!;
        const segmentLength = segmentEnd - segmentStart;
        if (segments.length !== segmentLength) {
            segments.length = segmentLength;
        }
        for (let i = 0; i < segmentLength; i++) {
            segments[i] = precomputedSegments[segmentStart + i]!;
        }

        const originIndex = stepIndex * 3;
        callback(
            data,
            segments,
            step,
            origins[originIndex]!,
            origins[originIndex + 1]!,
            origins[originIndex + 2]!,
            stepIndex === lastStep,
        );
    }
};

export const iterateSparseBlockAxis = <T>(
    blocks: ReadonlyMap<number, number>,
    blockSize: number,
    shift: number,
    data: TypedBuffer<T>,
    callback: Callback<T>,
    axis: IterateAxis,
): void => {
    const plan = buildSparseBlockAxisPlan(blocks, blockSize, shift, axis);
    if (plan === undefined) {
        return;
    }
    runSparseBlockAxisPlan(plan, shift, data, callback);
};
