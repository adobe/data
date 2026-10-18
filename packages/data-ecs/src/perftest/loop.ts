import { always } from "../interface/resources/always.js";
import { clock } from "../interface/resources/clock.js";
import { backToBack, createWorld } from "../implementation/index.js";
import { idle } from "./suite.js";

/** Ticks in each timed stretch of `loopTickIdle`. */
export const loopTicks = 10_000;

/**
 * The fastest of `stretches` stretches of `loopTicks` ticks with nothing changed, after one to warm up: a world with
 * `always` set, one system no entity matches, driven back to back, counted through an observer of its clock.
 */
export const loopTickIdle = async (stretches = 5): Promise<number> => {
    const driver = backToBack();
    const world = createWorld({ [always]: true }, { loop: driver });
    let best = Infinity;
    try {
        await new Promise<void>(resolve => {
            let ticks = 0;
            let stretch = 0;
            let start = 0;
            const unobserve = world.observe.resource(clock)(() => {
                if (ticks++ % loopTicks !== 0) return;
                const now = performance.now();
                // The first stretch warms up.
                if (stretch > 1) best = Math.min(best, now - start);
                start = now;
                if (stretch++ <= stretches) return;
                unobserve();
                resolve();
            });
            world.add(idle);
        });
    }
    finally {
        await world.dispose();
        driver.close();
    }
    return best;
};
