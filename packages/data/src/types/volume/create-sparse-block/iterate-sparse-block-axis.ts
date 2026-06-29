// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { TypedBuffer } from "../../../typed-buffer/typed-buffer.js";
import type { Callback } from "../callback.js";
import type { IterateAxis } from "../iterate-axis.js";
import type { BlockDims } from "./block-dims.js";

const BLOCK_STRIDE = 5;
const STEP_STRIDE = 4;

export interface SparseBlockAxisPlan {
    readonly axis: IterateAxis;
    readonly step: number;
    readonly segmentLength: number;
    readonly segments: number[];
    readonly precomputedSegments: readonly number[];
    readonly stepSegmentStarts: readonly number[];
    readonly origins: readonly number[];
    readonly callbackCount: number;
    readonly maxSegmentLength: number;
    readonly uniformSegmentLength: number | undefined;
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

export const buildSparseBlockAxisPlan = (
    blocks: ReadonlyMap<number, number>,
    dims: BlockDims,
    axis: IterateAxis,
): SparseBlockAxisPlan | undefined => {
    if (blocks.size === 0) {
        return undefined;
    }

    const layout = dims.iterate[axis];
    const decodeKey = dims.decodeKey;

    const groups = new Map<number, number[]>();
    for (const [key, offset] of blocks) {
        const [bx, by, bz] = decodeKey(key);
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
        for (let inner = 0; inner < layout.blockPlane; inner++) {
            appendAdjacentRuns(groupIndex, inner, groupBlocks, blockCount, steps);
        }
    }

    const callbackCount = steps.length / STEP_STRIDE;
    const stepSegmentStarts = new Array<number>(callbackCount + 1);
    const precomputedSegments: number[] = [];
    const origins = new Array<number>(callbackCount * 3);
    const segmentLengthConst = layout.segmentLength;

    for (let stepIndex = 0, s = 0; stepIndex < callbackCount; stepIndex++, s += STEP_STRIDE) {
        const groupBlocks = sortedGroups[steps[s]!]!;
        const inner = steps[s + 1]!;
        const runStart = steps[s + 2]!;
        const runEnd = steps[s + 3]!;
        const la = inner % layout.innerA;
        const lb = (inner / layout.innerA) | 0;

        stepSegmentStarts[stepIndex] = precomputedSegments.length;
        for (let i = runStart; i < runEnd; i++) {
            const base = i * BLOCK_STRIDE;
            precomputedSegments.push(
                layout.segmentOffset(groupBlocks[base + 4]!, la, lb),
                segmentLengthConst,
            );
        }

        const first = runStart * BLOCK_STRIDE;
        layout.writeOrigin(
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
    let uniformSegmentLength: number | undefined;
    for (let stepIndex = 0; stepIndex < callbackCount; stepIndex++) {
        const length = stepSegmentStarts[stepIndex + 1]! - stepSegmentStarts[stepIndex]!;
        if (length > maxSegmentLength) {
            maxSegmentLength = length;
        }
        if (stepIndex === 0) {
            uniformSegmentLength = length;
        } else if (uniformSegmentLength !== length) {
            uniformSegmentLength = undefined;
        }
    }

    return {
        axis,
        step: layout.step,
        segmentLength: segmentLengthConst,
        segments: maxSegmentLength > 0 ? new Array(maxSegmentLength) : [],
        precomputedSegments,
        stepSegmentStarts,
        origins,
        callbackCount,
        maxSegmentLength,
        uniformSegmentLength,
    };
};

export const runSparseBlockAxisPlan = <T>(
    plan: SparseBlockAxisPlan,
    data: TypedBuffer<T>,
    callback: Callback<T>,
): void => {
    const {
        step,
        segments,
        precomputedSegments,
        stepSegmentStarts,
        origins,
        callbackCount,
        uniformSegmentLength,
    } = plan;
    const lastStep = callbackCount - 1;

    if (uniformSegmentLength !== undefined) {
        segments.length = uniformSegmentLength;
        for (let stepIndex = 0; stepIndex < callbackCount; stepIndex++) {
            const segmentStart = stepSegmentStarts[stepIndex]!;
            for (let i = 0; i < uniformSegmentLength; i++) {
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
        return;
    }

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
    dims: BlockDims,
    data: TypedBuffer<T>,
    callback: Callback<T>,
    axis: IterateAxis,
): void => {
    const plan = buildSparseBlockAxisPlan(blocks, dims, axis);
    if (plan !== undefined) {
        runSparseBlockAxisPlan(plan, data, callback);
    }
};
