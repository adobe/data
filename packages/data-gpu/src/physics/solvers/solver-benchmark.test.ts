// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { runSolverBenchmark } from "./solver-benchmark.js";
import { cpuXpbd } from "./cpu-xpbd/cpu-xpbd-plugin.js";

// Performance baseline for the CPU-XPBD solver. Run with:
//   npx vitest --run src/physics/solvers/solver-benchmark.test.ts
// The logged ms/frame is the number to watch when changing the solver. Other
// solvers (e.g. rapierSolver) feed the same harness for a side-by-side baseline.
describe("solver benchmark — cpuXpbd", () => {
    it("256 bodies × 300 frames", async () => {
        const r = await runSolverBenchmark(cpuXpbd, { bodies: 256, frames: 300 });
        // eslint-disable-next-line no-console
        console.log(`cpuXpbd: ${r.msPerFrame.toFixed(3)} ms/frame · ${r.simFps.toFixed(0)} sim-fps · max ${r.maxFrameMs.toFixed(2)} ms · ${r.bodies} bodies · avgY ${r.avgY.toFixed(2)} maxV ${r.maxSpeed.toFixed(1)}`);
        expect(r.frames).toBe(300);
        expect(r.msPerFrame).toBeGreaterThan(0);
    }, 30_000);
});
