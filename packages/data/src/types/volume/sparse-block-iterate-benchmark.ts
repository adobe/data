// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Boolean } from "../../schema/boolean/index.js";
import type { BatchCallback, Callback, SegmentViewCallback } from "./callback.js";
import type { IterateAxis } from "./iterate-axis.js";
import type { Volume } from "./volume.js";
import { createSparseBlock } from "./create-sparse-block/create-sparse-block.js";
import { isSparseBlockVolume } from "./create-sparse-block/is-sparse-block-volume.js";
import type { SparseBlockVolume } from "./create-sparse-block/sparse-block-volume.js";

export type SparseBlockIterateApi = "callback" | "view" | "batch";

export type SparseBlockIterateLayout = "adjacent" | "fragmented" | "scattered";

export interface SparseBlockIterateSceneOptions {
    readonly layout: SparseBlockIterateLayout;
    /** Blocks to allocate (along the axis for adjacent/fragmented). */
    readonly blocks: number;
    readonly blockSize?: number;
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
    readonly api?: SparseBlockIterateApi;
}

export interface SparseBlockIterateBenchmarkResult extends IterateInvocationStats {
    readonly axis: IterateAxis;
    readonly blockCount: number;
    readonly blockSize: number;
    readonly layout: SparseBlockIterateSceneOptions["layout"];
    readonly warmupIterations: number;
    readonly timedIterations: number;
    readonly totalMs: number;
    readonly msPerIteration: number;
    readonly iterationsPerSecond: number;
    readonly voxelsPerSecond: number;
    readonly api: SparseBlockIterateApi;
}

export const createIterateStatsCollector = (): {
    readonly stats: IterateInvocationStats;
    readonly recordLine: (pairCount: number, voxelsAlongAxis: number) => void;
} => {
    const stats = { callbacks: 0, segmentPairs: 0, voxelsAlongAxis: 0 };
    const recordLine = (pairCount: number, voxelsAlongAxis: number) => {
        stats.callbacks++;
        stats.segmentPairs += pairCount;
        stats.voxelsAlongAxis += voxelsAlongAxis;
    };
    return { stats, recordLine };
};

export const buildSparseBlockIterateScene = (
    options: SparseBlockIterateSceneOptions,
): Volume<boolean> => {
    const blockSize = options.blockSize ?? 16;
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
            touch(gx * blockSize, gy * blockSize, 0);
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

const bindIterate = (
    volume: SparseBlockVolume<boolean>,
    axis: IterateAxis,
    api: SparseBlockIterateApi,
) => {
    if (api === "batch") {
        return axis === "x" ? volume.iterateXBatch.bind(volume)
            : axis === "y" ? volume.iterateYBatch.bind(volume)
                : volume.iterateZBatch.bind(volume);
    }
    if (api === "view") {
        return axis === "x" ? volume.iterateXView.bind(volume)
            : axis === "y" ? volume.iterateYView.bind(volume)
                : volume.iterateZView.bind(volume);
    }
    return axis === "x" ? volume.iterateX.bind(volume)
        : axis === "y" ? volume.iterateY.bind(volume)
            : volume.iterateZ.bind(volume);
};

const requireSparseVolume = (volume: Volume<boolean>): SparseBlockVolume<boolean> => {
    if (!isSparseBlockVolume(volume)) {
        throw new Error("sparse block iterate benchmark requires a sparse block volume");
    }
    return volume;
};

export const measureIterateOnce = (
    volume: Volume<boolean>,
    axis: IterateAxis,
    api: SparseBlockIterateApi = "callback",
): IterateInvocationStats => {
    const sparse = requireSparseVolume(volume);
    const { stats, recordLine } = createIterateStatsCollector();
    bindIterate(sparse, axis, api)(withIterateWork(recordLine, api));
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
    const api = opts.api ?? "callback";
    const blockSize = scene.blockSize ?? 16;
    const sparse = requireSparseVolume(volume);

    const iterate = bindIterate(sparse, axis, api);

    for (let i = 0; i < warmupIterations; i++) {
        iterate(withIterateWork(() => {}, api));
    }

    const measured = createIterateStatsCollector();
    const measuredInvoke = withIterateWork(measured.recordLine, api);

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
        blockSize,
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
        api,
    };
};

export const formatSparseBlockIterateBenchmark = (result: SparseBlockIterateBenchmarkResult): string => {
    const layout = result.layout.padEnd(10);
    const axis = result.axis.toUpperCase();
    return [
        `${layout} ${axis} · ${String(result.blockCount).padStart(4)} blocks · bs=${result.blockSize} · ${result.api}`,
        `  ${result.msPerIteration.toFixed(3).padStart(8)} ms/iter · ${result.iterationsPerSecond.toFixed(0).padStart(7)} iter/s · ${(result.voxelsPerSecond / 1_000_000).toFixed(2).padStart(6)} Mvox/s`,
        `  ${result.callbacks.toFixed(0).padStart(8)} callbacks/iter · ${result.segmentPairs.toFixed(0).padStart(7)} pairs/iter · ${result.voxelsAlongAxis.toFixed(0).padStart(10)} voxels/iter`,
    ].join("\n");
};

const originForBlock = (
    blockIndex: number,
    by: number,
    bz: number,
    blockSize: number,
    axis: IterateAxis,
): readonly [number, number, number] => {
    const origin = blockIndex * blockSize;
    if (axis === "x") {
        return [origin, by * blockSize, bz * blockSize] as const;
    }
    if (axis === "y") {
        return [by * blockSize, origin, bz * blockSize] as const;
    }
    return [by * blockSize, bz * blockSize, origin] as const;
};

/** Reads every voxel in each segment so iteration cost includes real buffer work. */
const withIterateWork = (
    recordLine: (pairCount: number, voxelsAlongAxis: number) => void,
    api: SparseBlockIterateApi,
): Callback<boolean> | SegmentViewCallback<boolean> | BatchCallback<boolean> => {
    let sink = 0;
    if (api === "batch") {
        const batchCallback: BatchCallback<boolean> = (batch) => {
            for (let stepIndex = 0; stepIndex < batch.lineCount; stepIndex++) {
                const segmentStart = batch.stepSegmentStarts[stepIndex]!;
                const segmentEnd = batch.stepSegmentStarts[stepIndex + 1]!;
                const pairCount = (segmentEnd - segmentStart) >> 1;
                let voxelsAlongAxis = 0;
                for (let i = segmentStart; i < segmentEnd; i += 2) {
                    const offset = batch.precomputedSegments[i]!;
                    const length = batch.precomputedSegments[i + 1]!;
                    voxelsAlongAxis += length;
                    for (let j = 0; j < length; j++) {
                        sink += batch.buffer.get(offset + j * batch.step) ? 1 : 0;
                    }
                }
                recordLine(pairCount, voxelsAlongAxis);
            }
            if (sink === Number.MAX_SAFE_INTEGER) {
                throw new Error("unreachable");
            }
        };
        return batchCallback;
    }
    if (api === "view") {
        const viewCallback: SegmentViewCallback<boolean> = (
            buffer,
            precomputed,
            segmentStart,
            pairCount,
            step,
        ) => {
            let voxelsAlongAxis = 0;
            const segmentEnd = segmentStart + (pairCount << 1);
            for (let i = segmentStart; i < segmentEnd; i += 2) {
                const offset = precomputed[i]!;
                const length = precomputed[i + 1]!;
                voxelsAlongAxis += length;
                for (let j = 0; j < length; j++) {
                    sink += buffer.get(offset + j * step) ? 1 : 0;
                }
            }
            recordLine(pairCount, voxelsAlongAxis);
            if (sink === Number.MAX_SAFE_INTEGER) {
                throw new Error("unreachable");
            }
        };
        return viewCallback;
    }

    return (buffer, segments, step) => {
        let voxelsAlongAxis = 0;
        const pairCount = segments.length >> 1;
        for (let i = 0; i < segments.length; i += 2) {
            const offset = segments[i]!;
            const length = segments[i + 1]!;
            voxelsAlongAxis += length;
            for (let j = 0; j < length; j++) {
                sink += buffer.get(offset + j * step) ? 1 : 0;
            }
        }
        recordLine(pairCount, voxelsAlongAxis);
        if (sink === Number.MAX_SAFE_INTEGER) {
            throw new Error("unreachable");
        }
    };
};
