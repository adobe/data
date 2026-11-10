// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { World } from "@adobe/ecs";
import { budget } from "./constant.budget.js";
import type { Sample } from "./type.sample.js";

/**
 * Times `run` once on each of a series of new worlds, after `setup` on each, as the suite times each iteration on a
 * new registry. The first `budget.warmUpWorlds` warm up.
 */
export const measureWorlds = async (create: () => World, setup: (world: World) => Promise<unknown>, run: (world: World) => Promise<unknown>): Promise<Sample> => {
    const times: number[] = [];
    let total = 0;
    for (let i = 0; i < budget.warmUpWorlds + budget.timedRuns || (total < budget.timed && i < budget.warmUpWorlds + budget.maximumWorlds); i++) {
        const world = create();
        try {
            await setup(world);
            const start = performance.now();
            await run(world);
            const elapsed = performance.now() - start;
            if (i < budget.warmUpWorlds) continue;
            total += elapsed;
            times.push(elapsed * 1e6);
        }
        finally {
            await world.dispose();
        }
    }
    return { times: times.sort((a, b) => a - b) };
};
