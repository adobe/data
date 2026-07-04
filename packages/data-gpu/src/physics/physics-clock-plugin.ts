// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { core } from "../core/core-plugin.js";
import type { PhysicsClock } from "./physics-clock/physics-clock.js";

const DEFAULT: PhysicsClock = { fixedDt: 1 / 60, accumulator: 0, alpha: 0, steps: 0, maxSubSteps: 8 };

/**
 * Provides the `physicsClock` resource and advances it once per render frame.
 * Solver plugins extend this and run `physicsClock.steps` fixed steps; the
 * interpolation system reads `physicsClock.alpha`. The advance runs first in the
 * `physics` phase so solvers (scheduled `after: ["advancePhysicsClock"]`) see it.
 */
export const physicsClock = Database.Plugin.create({
    extends: core,
    resources: {
        physicsClock: { default: DEFAULT as PhysicsClock, nonPersistent: true },
    },
    transactions: {
        /** Set the simulation rate (Hz). Call once at init; default is 60. */
        setFixedTimestep(t, hz: number) {
            t.resources.physicsClock = { ...t.resources.physicsClock, fixedDt: 1 / hz };
        },
    },
    systems: {
        advancePhysicsClock: {
            schedule: { during: ["physics"] },
            create: db => () => {
                const c = db.store.resources.physicsClock;
                const h = c.fixedDt;
                const acc = c.accumulator + Math.min(db.store.resources.frameTime.dt, h * c.maxSubSteps);
                const steps = Math.min(Math.floor(acc / h), c.maxSubSteps);
                db.store.resources.physicsClock = { ...c, accumulator: acc - steps * h, alpha: (acc - steps * h) / h, steps };
            },
        },
    },
});
