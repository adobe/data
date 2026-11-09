// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { World } from "@adobe/ecs";
import { budget } from "./constant.budget.js";
import type { Sample } from "./type.sample.js";

/**
 * Times `run` on one world after `setup`, as an app's frames run: warmed up, then timed `batch` runs at a time, each
 * sample their mean. The counts are fixed, not timed, so every measurement times the same states: the entities' data
 * moves on with each run, and how much work a run does depends on where it is.
 */
export const measureRuns = async (world: World, setup: () => Promise<unknown>, run: () => Promise<unknown>, batch = 1): Promise<Sample> => {
    try {
        await setup();
        for (let i = 0; i < budget.warmUpRuns; i++) await run();
        const times: number[] = [];
        for (let sample = 0; sample < budget.samples; sample++) {
            const start = performance.now();
            for (let i = 0; i < batch; i++) await run();
            times.push(((performance.now() - start) / batch) * 1e6);
        }
        return { times: times.sort((a, b) => a - b) };
    }
    finally {
        await world.dispose();
    }
};
