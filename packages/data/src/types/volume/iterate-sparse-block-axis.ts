// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { TypedBuffer } from "../../typed-buffer/typed-buffer.js";
import type { Callback } from "./callback.js";
import type { IterateAxis } from "./iterate-axis.js";
import { localBlockIndex } from "./volume-index.js";
import { packPlaneKey } from "./create-sparse-block/pack-block-key.js";
import { unpackBlockKey } from "./create-sparse-block/unpack-block-key.js";

interface BlockSlice {
    readonly vary: number;
    readonly bx: number;
    readonly by: number;
    readonly bz: number;
    readonly offset: number;
}

interface AxisLayout {
    readonly step: number;
    readonly groupKey: (bx: number, by: number, bz: number) => number;
    readonly vary: (bx: number, by: number, bz: number) => number;
    readonly segmentOffset: (offset: number, la: number, lb: number, blockSize: number, blockVolume: number) => number;
    readonly origin: (shift: number, block: BlockSlice, la: number, lb: number) => readonly [number, number, number];
}

const axisLayouts: Record<IterateAxis, AxisLayout> = {
    x: {
        step: 1,
        groupKey: (_bx, by, bz) => packPlaneKey(bz, by),
        vary: (bx) => bx,
        segmentOffset: (offset, ly, lz, blockSize, blockVolume) =>
            offset + ly * blockSize + lz * blockVolume,
        origin: (shift, block, ly, lz) => [
            block.bx << shift,
            (block.by << shift) + ly,
            (block.bz << shift) + lz,
        ] as const,
    },
    y: {
        step: 0, // resolved at runtime
        groupKey: (bx, _by, bz) => packPlaneKey(bz, bx),
        vary: (_bx, by) => by,
        segmentOffset: (offset, lx, lz, _blockSize, blockVolume) =>
            offset + lx + lz * blockVolume,
        origin: (shift, block, lx, lz) => [
            (block.bx << shift) + lx,
            block.by << shift,
            (block.bz << shift) + lz,
        ] as const,
    },
    z: {
        step: 0,
        groupKey: (bx, by) => packPlaneKey(by, bx),
        vary: (_bx, _by, bz) => bz,
        segmentOffset: (offset, lx, ly, blockSize) =>
            offset + localBlockIndex(lx, ly, 0, blockSize),
        origin: (shift, block, lx, ly) => [
            (block.bx << shift) + lx,
            (block.by << shift) + ly,
            block.bz << shift,
        ] as const,
    },
};

const compareBlockSlices = (a: BlockSlice, b: BlockSlice): number => a.vary - b.vary;

const countAdjacentRuns = (blocks: readonly BlockSlice[]): number => {
    if (blocks.length === 0) {
        return 0;
    }
    let runs = 1;
    for (let i = 1; i < blocks.length; i++) {
        if (blocks[i]!.vary !== blocks[i - 1]!.vary + 1) {
            runs++;
        }
    }
    return runs;
};

const forEachAdjacentRun = (
    blocks: readonly BlockSlice[],
    emit: (start: number, end: number) => void,
): void => {
    if (blocks.length === 0) {
        return;
    }
    let runStart = 0;
    for (let i = 1; i <= blocks.length; i++) {
        if (i === blocks.length || blocks[i]!.vary !== blocks[i - 1]!.vary + 1) {
            emit(runStart, i);
            runStart = i;
        }
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
    if (blocks.size === 0) {
        return;
    }

    const blockVolume = blockSize * blockSize * blockSize;
    const blockPlane = blockSize * blockSize;
    const layout = axisLayouts[axis];
    const step = axis === "x" ? 1 : axis === "y" ? blockSize : blockPlane;

    const groups = new Map<number, BlockSlice[]>();
    for (const [key, offset] of blocks) {
        const { bx, by, bz } = unpackBlockKey(key);
        const groupKey = layout.groupKey(bx, by, bz);
        const slice: BlockSlice = { vary: layout.vary(bx, by, bz), bx, by, bz, offset };
        const group = groups.get(groupKey);
        if (group === undefined) {
            groups.set(groupKey, [slice]);
        } else {
            group.push(slice);
        }
    }

    const sortedGroups: BlockSlice[][] = [];
    for (const [, groupBlocks] of [...groups.entries()].sort(([a], [b]) => a - b)) {
        groupBlocks.sort(compareBlockSlices);
        sortedGroups.push(groupBlocks);
    }

    let callbacksRemaining = 0;
    for (const groupBlocks of sortedGroups) {
        callbacksRemaining += blockPlane * countAdjacentRuns(groupBlocks);
    }

    const segments: number[] = [];
    for (const groupBlocks of sortedGroups) {
        for (let inner = 0; inner < blockPlane; inner++) {
            const la = inner % blockSize;
            const lb = (inner / blockSize) | 0;
            forEachAdjacentRun(groupBlocks, (runStart, runEnd) => {
                const pairCount = runEnd - runStart;
                segments.length = pairCount * 2;
                for (let i = runStart; i < runEnd; i++) {
                    const block = groupBlocks[i]!;
                    const pair = i - runStart;
                    segments[pair * 2] = layout.segmentOffset(
                        block.offset,
                        la,
                        lb,
                        blockSize,
                        blockVolume,
                    );
                    segments[pair * 2 + 1] = blockSize;
                }
                const first = groupBlocks[runStart]!;
                const [x, y, z] = layout.origin(shift, first, la, lb);
                callback(
                    data,
                    segments,
                    step,
                    x,
                    y,
                    z,
                    --callbacksRemaining === 0,
                );
            });
        }
    }
};
