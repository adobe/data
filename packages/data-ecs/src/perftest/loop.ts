import { always } from "../interface/resources/always.js";
import { System } from "../interface/system/system.js";
import { backToBack, createWorld } from "../implementation/index.js";
import { idle, unused } from "./suite.js";
import { eachTick } from "./synced.js";

/** Ticks in each timed stretch of `loopTickIdle`. */
export const loopTicks = 10_000;

/** Synced systems in `synced idle 100`. */
export const syncedIdles = 100;

/** Synced systems no entity matches, each run after every tick. */
const idleSynced = Array.from({ length: syncedIdles }, (_, i) => System.create({ name: `loop/idleSynced${i}`, synced: true, components: { has: [unused] } }, () => {}));

/**
 * The fastest of `stretches` stretches of `loopTicks` ticks with nothing changed, after one to warm up: a world with
 * `always` set, one system no entity matches and `synced` synced systems none matches, driven back to back, counted
 * by a synced system reading its clock.
 */
export const loopTickIdle = async (stretches = 5, synced = 0): Promise<number> => {
    const driver = backToBack();
    const world = createWorld({ [always]: true }, { loop: driver });
    let best = Infinity;
    try {
        await new Promise<void>(resolve => {
            let ticks = 0;
            let stretch = 0;
            let start = 0;
            const unobserve = eachTick(world, () => {
                if (ticks++ % loopTicks !== 0) return;
                const now = performance.now();
                // The first stretch warms up.
                if (stretch > 1) best = Math.min(best, now - start);
                start = now;
                if (stretch++ <= stretches) return;
                unobserve();
                resolve();
            });
            for (let k = 0; k < synced; k++) world.add(idleSynced[k]);
            world.add(idle);
        });
    }
    finally {
        await world.dispose();
        driver.close();
    }
    return best;
};
