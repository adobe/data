// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, expect, it } from "vitest";
import type { IterateAxis } from "./iterate-axis.js";
import {
    buildSparseBlockIterateScene,
    formatSparseBlockIterateBenchmark,
    measureIterateOnce,
    runSparseBlockIterateBenchmark,
    type SparseBlockIterateLayout,
} from "./sparse-block-iterate-benchmark.js";

// Track sparse-block axis iteration performance over time:
//   pnpm test -- src/types/volume/iterate-sparse-block.benchmark.test.ts
const BLOCK_SIZE = 16;
const AXES = ["x", "y", "z"] as const satisfies readonly IterateAxis[];
const LAYOUTS = ["adjacent", "fragmented"] as const satisfies readonly SparseBlockIterateLayout[];

describe("sparse block iterate benchmarks", () => {
    it.each(AXES)("merges adjacent blocks into fewer callbacks than fragmented lines (%s)", (axis) => {
        const adjacent = buildSparseBlockIterateScene({
            layout: "adjacent",
            blocks: 32,
            blockSize: BLOCK_SIZE,
            axis,
        });
        const fragmented = buildSparseBlockIterateScene({
            layout: "fragmented",
            blocks: 32,
            blockSize: BLOCK_SIZE,
            axis,
        });

        const adj = measureIterateOnce(adjacent, axis);
        const frag = measureIterateOnce(fragmented, axis);

        expect(adj.callbacks).toBe(BLOCK_SIZE * BLOCK_SIZE);
        expect(adj.segmentPairs).toBe(adj.callbacks * 32);
        expect(frag.callbacks).toBe(adj.callbacks * 32);
        expect(frag.segmentPairs).toBe(frag.callbacks);
        expect(adj.voxelsAlongAxis).toBe(frag.voxelsAlongAxis);
    });

    it.each(AXES)("adjacent lines iterate faster than fragmented lines on %s (same voxel work)", (axis) => {
        const scene = {
            blocks: 64,
            blockSize: BLOCK_SIZE,
            axis,
        };
        const adjacent = buildSparseBlockIterateScene({ ...scene, layout: "adjacent" });
        const fragmented = buildSparseBlockIterateScene({ ...scene, layout: "fragmented" });

        const adjacentResult = runSparseBlockIterateBenchmark(adjacent, { ...scene, layout: "adjacent" }, {
            warmupIterations: 100,
            timedIterations: 600,
        });
        const fragmentedResult = runSparseBlockIterateBenchmark(fragmented, { ...scene, layout: "fragmented" }, {
            warmupIterations: 100,
            timedIterations: 600,
        });

        expect(adjacentResult.voxelsAlongAxis).toBe(fragmentedResult.voxelsAlongAxis);
        expect(adjacentResult.callbacks).toBeLessThan(fragmentedResult.callbacks / 10);
        expect(adjacentResult.msPerIteration).toBeLessThan(fragmentedResult.msPerIteration);
    });

    it("reports iterateX/Y/Z throughput for adjacent and fragmented layouts", () => {
        const scenes = AXES.flatMap(axis =>
            LAYOUTS.map(layout => ({ layout, blocks: 64, axis })),
        );

        const lines: string[] = [];
        for (const scene of scenes) {
            const volume = buildSparseBlockIterateScene({ ...scene, blockSize: BLOCK_SIZE });
            const result = runSparseBlockIterateBenchmark(volume, scene, {
                warmupIterations: 60,
                timedIterations: 300,
            });
            lines.push(formatSparseBlockIterateBenchmark(result));
        }

        // eslint-disable-next-line no-console
        console.log(`\nsparse block iterate (${BLOCK_SIZE}³ blocks)\n${lines.join("\n\n")}\n`);
        expect(lines.length).toBe(AXES.length * LAYOUTS.length);
    }, 60_000);
});
