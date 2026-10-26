// © 2026 Adobe. MIT License. See /LICENSE for details.
import { always } from "../interface/resources/always.js";
import { System } from "../interface/system/system.js";
import { backToBack, createWorld } from "../implementation/index.js";
import { idle, unused } from "./suite.js";
import { eachTick } from "./observer.js";

/** Ticks in each timed stretch of `loopTickIdle`. */
export const loopTicks = 10_000;

/** Observer systems in `observer idle 100`. */
export const observerIdles = 100;

/** Observer systems no entity matches, each run after every tick. */
const idleObserver = Array.from({ length: observerIdles }, (_, i) => System.create({ observer: true, components: { with: [unused] } }, () => {}));

/**
 * The fastest of `stretches` stretches of `loopTicks` ticks with nothing changed, after one to warm up: a world with
 * `always` set, one system no entity matches and `observer` observer systems none matches, driven back to back, counted
 * by an observer system reading its clock.
 */
export const loopTickIdle = async (stretches = 5, observer = 0): Promise<number> => {
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
            for (let k = 0; k < observer; k++) world.add(idleObserver[k]);
            world.add(idle);
        });
    }
    finally {
        await world.dispose();
        driver.close();
    }
    return best;
};
