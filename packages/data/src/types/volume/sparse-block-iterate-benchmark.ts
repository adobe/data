// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "../../math/index.js";
import { Boolean } from "../../schema/boolean/index.js";
import type { Callback } from "./callback.js";
import type { IterateAxis } from "./iterate-axis.js";
import type { Volume } from "./volume.js";
import { normalizeBlockSize } from "./create-sparse-block/block-dims.js";
import { createSparseBlock } from "./create-sparse-block/create-sparse-block.js";
import { isSparseBlockVolume } from "./create-sparse-block/is-sparse-block-volume.js";

export type SparseBlockIterateLayout = "adjacent" | "fragmented" | "scattered";

export interface SparseBlockIterateSceneOptions {
    readonly layout: SparseBlockIterateLayout;
    /** Blocks to allocate (along the axis for adjacent/fragmented). */
    readonly blocks: number;
    readonly blockSize?: number | Vec3;
    readonly axis?: IterateAxis;
}

export interface IterateInvocationStats {
    readonly callbacks: number;
    readonly segmentPairs: number;
    readonly voxelsAlongAxis: number;
}

export interface SparseBlockIterateBenchmarkOptions {
    readonly axis?: IterateAxis;
    readonly warmupIterations?: number;
    readonly timedIterations?: number;
}

export interface SparseBlockIterateBenchmarkResult extends IterateInvocationStats {
    readonly axis: IterateAxis;
    readonly blockCount: number;
    readonly blockSize: string;
    readonly layout: SparseBlockIterateSceneOptions["layout"];
    readonly warmupIterations: number;
    readonly timedIterations: number;
    readonly totalMs: number;
    readonly msPerIteration: number;
    readonly iterationsPerSecond: number;
    readonly voxelsPerSecond: number;
}

export const createIterateStatsCollector = (): {
    readonly stats: IterateInvocationStats;
    readonly callback: Callback<boolean>;
} => {
    const stats = { callbacks: 0, segmentPairs: 0, voxelsAlongAxis: 0 };
    const callback: Callback<boolean> = (_buffer, segments) => {
        stats.callbacks++;
        const pairCount = segments.length >> 1;
        stats.segmentPairs += pairCount;
        for (let i = 0; i < segments.length; i += 2) {
            stats.voxelsAlongAxis += segments[i + 1]!;
        }
    };
    return { stats, callback };
};

const formatBlockSize = (blockSize: Vec3): string =>
    blockSize[0] === blockSize[1] && blockSize[1] === blockSize[2]
        ? String(blockSize[0])
        : `${blockSize[0]}×${blockSize[1]}×${blockSize[2]}`;

export const buildSparseBlockIterateScene = (
    options: SparseBlockIterateSceneOptions,
): Volume<boolean> => {
    const blockSize = normalizeBlockSize(options.blockSize ?? 16);
    const axis = options.axis ?? "x";
    const volume = createSparseBlock(Boolean.schema, blockSize);

    const touch = (x: number, y: number, z: number) => {
        volume.set(x, y, z, true);
    };

    if (options.layout === "scattered") {
        const side = Math.ceil(Math.sqrt(options.blocks));
        for (let i = 0; i < options.blocks; i++) {
            const gx = i % side;
            const gy = (i / side) | 0;
            touch(gx * blockSize[0], gy * blockSize[1], 0);
        }
        return volume;
    }

    const stride = options.layout === "fragmented" ? 2 : 1;
    for (let i = 0; i < options.blocks; i++) {
        const blockIndex = i * stride;
        touch(...originForBlock(blockIndex, 0, 0, blockSize, axis));
    }
    return volume;
};

export const blockCountOf = (volume: Volume<boolean>): number => {
    if (!isSparseBlockVolume(volume)) {
        return 0;
    }
    return volume.toSerialized().blocks.length;
};

const bindIterate = (volume: Volume<boolean>, axis: IterateAxis) =>
    axis === "x" ? volume.iterateX.bind(volume)
        : axis === "y" ? volume.iterateY.bind(volume)
            : volume.iterateZ.bind(volume);

export const measureIterateOnce = (
    volume: Volume<boolean>,
    axis: IterateAxis,
): IterateInvocationStats => {
    const { stats, callback } = createIterateStatsCollector();
    bindIterate(volume, axis)(withIterateWork(callback));
    return { ...stats };
};

export const runSparseBlockIterateBenchmark = (
    volume: Volume<boolean>,
    scene: SparseBlockIterateSceneOptions,
    opts: SparseBlockIterateBenchmarkOptions = {},
): SparseBlockIterateBenchmarkResult => {
    const axis = opts.axis ?? scene.axis ?? "x";
    const warmupIterations = opts.warmupIterations ?? 50;
    const timedIterations = opts.timedIterations ?? 500;
    const blockSize = normalizeBlockSize(scene.blockSize ?? 16);

    const iterate = bindIterate(volume, axis);

    for (let i = 0; i < warmupIterations; i++) {
        iterate(withIterateWork(createIterateStatsCollector().callback));
    }

    const measured = createIterateStatsCollector();
    const measuredInvoke = withIterateWork(measured.callback);

    const start = performance.now();
    for (let i = 0; i < timedIterations; i++) {
        measured.stats.callbacks = 0;
        measured.stats.segmentPairs = 0;
        measured.stats.voxelsAlongAxis = 0;
        iterate(measuredInvoke);
    }
    const totalMs = performance.now() - start;

    const msPerIteration = totalMs / timedIterations;
    const perIteration = measured.stats;

    return {
        axis,
        blockCount: blockCountOf(volume),
        blockSize: formatBlockSize(blockSize),
        layout: scene.layout,
        warmupIterations,
        timedIterations,
        totalMs,
        msPerIteration,
        iterationsPerSecond: 1000 / msPerIteration,
        voxelsPerSecond: perIteration.voxelsAlongAxis * (1000 / msPerIteration),
        callbacks: perIteration.callbacks,
        segmentPairs: perIteration.segmentPairs,
        voxelsAlongAxis: perIteration.voxelsAlongAxis,
    };
};

export const formatSparseBlockIterateBenchmark = (result: SparseBlockIterateBenchmarkResult): string => {
    const layout = result.layout.padEnd(10);
    const axis = result.axis.toUpperCase();
    return [
        `${layout} ${axis} · ${String(result.blockCount).padStart(4)} blocks · bs=${result.blockSize}`,
        `  ${result.msPerIteration.toFixed(3).padStart(8)} ms/iter · ${result.iterationsPerSecond.toFixed(0).padStart(7)} iter/s · ${(result.voxelsPerSecond / 1_000_000).toFixed(2).padStart(6)} Mvox/s`,
        `  ${result.callbacks.toFixed(0).padStart(8)} callbacks/iter · ${result.segmentPairs.toFixed(0).padStart(7)} pairs/iter · ${result.voxelsAlongAxis.toFixed(0).padStart(10)} voxels/iter`,
    ].join("\n");
};

const originForBlock = (
    blockIndex: number,
    by: number,
    bz: number,
    blockSize: Vec3,
    axis: IterateAxis,
): readonly [number, number, number] => {
    const [sx, sy, sz] = blockSize;
    if (axis === "x") {
        return [blockIndex * sx, by * sy, bz * sz] as const;
    }
    if (axis === "y") {
        return [by * sx, blockIndex * sy, bz * sz] as const;
    }
    return [by * sx, bz * sy, blockIndex * sz] as const;
};

/** Reads every voxel in each segment so iteration cost includes real buffer work. */
const withIterateWork = (callback: Callback<boolean>): Callback<boolean> => {
    let sink = 0;
    return (buffer, segments, step) => {
        callback(buffer, segments, step, 0, 0, 0, false);
        for (let i = 0; i < segments.length; i += 2) {
            const offset = segments[i]!;
            const length = segments[i + 1]!;
            for (let j = 0; j < length; j++) {
                sink += buffer.get(offset + j * step) ? 1 : 0;
            }
        }
        if (sink === Number.MAX_SAFE_INTEGER) {
            throw new Error("unreachable");
        }
    };
};
