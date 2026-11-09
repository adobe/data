// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { World } from "@adobe/ecs";
import { budget } from "./constant.budget.js";
import type { Sample } from "./type.sample.js";

/**
 * Times `run` on one world after `setup`, as an app's frames run: warmed up, then timed `batch` runs at a time until
 * the budget is spent, each sample their mean.
 */
export const measureRuns = async (world: World, setup: () => Promise<unknown>, run: () => Promise<unknown>, batch = 1): Promise<Sample> => {
    try {
        await setup();
        const warmUpEnd = performance.now() + budget.warmUp;
        for (let i = 0; i < budget.warmUpRuns || performance.now() < warmUpEnd; i++) await run();
        const times: number[] = [];
        let total = 0;
        while ((times.length < budget.timedRuns || total < budget.timed) && times.length < budget.maximumRuns) {
            const start = performance.now();
            for (let i = 0; i < batch; i++) await run();
            const elapsed = performance.now() - start;
            total += elapsed;
            times.push((elapsed / batch) * 1e6);
        }
        return { times: times.sort((a, b) => a - b) };
    }
    finally {
        await world.dispose();
    }
};
