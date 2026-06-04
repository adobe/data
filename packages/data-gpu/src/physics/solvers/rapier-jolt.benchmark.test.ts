// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { runSolverBenchmark } from "./solver-benchmark.js";
import { cpuXpbd } from "./cpu-xpbd/cpu-xpbd-plugin.js";
import { rapierSolver } from "./rapier-solver-plugin.js";
import { joltSolver } from "./jolt-solver-plugin.js";

// Side-by-side performance baseline of every solver through the shared harness.
//   npx vitest --run src/physics/solvers/rapier-jolt.benchmark.test.ts
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

    // The "many static, few dynamic" target: thousands of resting static bodies
    // plus a handful of dynamics. The solver's per-frame sync must NOT re-scan
    // every body — bodies already mirrored into the engine are tagged and
    // excluded, so steady-state iteration is ~zero. (Measured win at 20k static:
    // jolt 0.53→0.07 ms/frame, rapier 1.51→1.13.)
    it("scales with many static bodies (sync excludes already-mirrored)", async () => {
        const OPTS_S = { bodies: 64, staticBodies: 8000, frames: 120, warmupFrames: 60 };
        const rap = await runSolverBenchmark(rapierSolver, OPTS_S);
        const jol = await runSolverBenchmark(joltSolver, OPTS_S);
        // eslint-disable-next-line no-console
        console.log(`\n${OPTS_S.staticBodies} static + ${OPTS_S.bodies} dynamic\nrapierSolver ${rap.msPerFrame.toFixed(3)} ms/frame\njoltSolver   ${jol.msPerFrame.toFixed(3)} ms/frame\n`);
        expect(rap.frames).toBe(120);
        expect(jol.frames).toBe(120);
    }, 90_000);
});
