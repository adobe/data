// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { World } from "@adobe/ecs";
import { clearEntities } from "../scenarios/model/index.js";
import { budget } from "./constant.budget.js";
import type { Sample } from "./type.sample.js";

/**
 * Times `run` on one world after `setup`, as an app's frames run: warmed up for at least `budget.warmUp` milliseconds
 * and `budget.warmUpRuns` runs, so V8 has optimized the bodies, tiered WASM up and started the pool's workers; then
 * set up again from no entities and run `budget.settleRuns` times, which brings the pool's cores back up to speed
 * after setting up; then timed `batch` runs at a time for `budget.samples` samples, each their mean. The entities'
 * data moves on with each run and decides how much work a run does, so every measurement times the same states from
 * the same start, however many runs warming up took. A batch ends once `settle` resolves, after the GPU has done what
 * its runs gave it, so a sample times their work done, its frames given to the GPU one after another as an app's are.
 */
export const measureRuns = async (world: World, setup: () => Promise<unknown>, run: () => Promise<unknown>, batch = 1, settle: () => Promise<void> = async () => {}): Promise<Sample> => {
    try {
        await setup();
        const warmUpEnd = performance.now() + budget.warmUp;
        for (let i = 0; i < budget.warmUpRuns || performance.now() < warmUpEnd; i++) await run();
        await world.run(clearEntities);
        await setup();
        for (let i = 0; i < budget.settleRuns; i++) await run();
        await settle();
        const times: number[] = [];
        for (let sample = 0; sample < budget.samples; sample++) {
            const start = performance.now();
            for (let i = 0; i < batch; i++) await run();
            await settle();
            times.push(((performance.now() - start) / batch) * 1e6);
        }
        return { times: times.sort((a, b) => a - b) };
    }
    finally {
        await world.dispose();
    }
};
