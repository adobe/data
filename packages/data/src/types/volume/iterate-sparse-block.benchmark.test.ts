// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it } from "vitest";
import type { IterateAxis } from "./iterate-axis.js";
import {
    buildSparseBlockIterateScene,
    formatSparseBlockIterateBenchmark,
    measureIterateOnce,
    runSparseBlockIterateBenchmark,
    type SparseBlockIterateLayout,
} from "./sparse-block-iterate-benchmark.js";

// Informational only — logs throughput for manual/regression review, never fails CI.
//   pnpm test -- src/types/volume/iterate-sparse-block.benchmark.test.ts
const BLOCK_SIZE = 16;
const AXES = ["x", "y", "z"] as const satisfies readonly IterateAxis[];
const LAYOUTS = ["adjacent", "fragmented"] as const satisfies readonly SparseBlockIterateLayout[];

describe("sparse block iterate benchmarks", () => {
    it.each(AXES)("merge stats adjacent vs fragmented (%s)", (axis) => {
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

        // eslint-disable-next-line no-console
        console.log(
            `\n${axis} merge stats · adjacent ${adj.callbacks} callbacks / ${adj.segmentPairs} pairs`
            + ` · fragmented ${frag.callbacks} callbacks / ${frag.segmentPairs} pairs`
            + ` · ${adj.voxelsAlongAxis} voxels each\n`,
        );
    });

    it.each(AXES)("throughput adjacent vs fragmented on %s", (axis) => {
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

        // eslint-disable-next-line no-console
        console.log(
            `\n${axis} throughput (${BLOCK_SIZE}³ blocks)\n`
            + `${formatSparseBlockIterateBenchmark(adjacentResult)}\n\n`
            + `${formatSparseBlockIterateBenchmark(fragmentedResult)}\n`,
        );
    }, 60_000);

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
    }, 60_000);

    it.each([
        { label: "16³", blockSize: [16, 16, 16] as const },
        { label: "32×16×8", blockSize: [32, 16, 8] as const },
    ])("reports adjacent throughput for non-cubic $label", ({ blockSize, label }) => {
        const blocks = 64;
        const layout = "adjacent" as const;
        const lines: string[] = [];

        for (const axis of AXES) {
            const volume = buildSparseBlockIterateScene({ blockSize, layout, blocks, axis });
            lines.push(formatSparseBlockIterateBenchmark(
                runSparseBlockIterateBenchmark(
                    volume,
                    { blockSize, layout, blocks, axis },
                    { warmupIterations: 80, timedIterations: 400 },
                ),
            ));
        }

        // eslint-disable-next-line no-console
        console.log(`\nsparse block iterate (${label}, 64 adjacent blocks)\n${lines.join("\n\n")}\n`);
    }, 120_000);
});
