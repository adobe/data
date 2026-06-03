// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { runSolverBenchmark, cpuXpbd } from "@adobe/data-gpu";
import { rapierSolver } from "./rapier-solver-plugin.js";
import { joltSolver } from "./jolt-solver-plugin.js";

// Side-by-side performance baseline of every solver through the shared harness.
// This lives in the samples package because that is where `rapierSolver` (and
// its WASM dependency) lives; the harness itself is exported from @adobe/data-gpu.
//   npx vitest --run src/solvers/rapier-solver.benchmark.test.ts
describe("solver benchmarks", () => {
    const OPTS = { bodies: 256, frames: 300 };

    it("cpuXpbd vs rapierSolver vs joltSolver — same scene", async () => {
        const cpu = await runSolverBenchmark(cpuXpbd, OPTS);
        const rap = await runSolverBenchmark(rapierSolver, OPTS);
        const jol = await runSolverBenchmark(joltSolver, OPTS);
        const line = (name: string, r: typeof cpu) =>
            `${name.padEnd(14)} ${r.msPerFrame.toFixed(3).padStart(8)} ms/frame · ${r.simFps.toFixed(0).padStart(5)} sim-fps · max ${r.maxFrameMs.toFixed(2).padStart(7)} ms · avgY ${r.avgY.toFixed(2).padStart(7)} · maxV ${r.maxSpeed.toFixed(1).padStart(7)} · sunk ${String(r.belowFloor).padStart(3)}`;
        // eslint-disable-next-line no-console
        console.log(`\n${OPTS.bodies} bodies × ${OPTS.frames} frames\n${line("cpuXpbd", cpu)}\n${line("rapierSolver", rap)}\n${line("joltSolver", jol)}\n`);
        expect(cpu.frames).toBe(300);
        expect(rap.frames).toBe(300);
        expect(jol.frames).toBe(300);
    }, 90_000);
});
