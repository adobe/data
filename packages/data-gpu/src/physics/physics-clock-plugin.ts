// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { core } from "../core/core-plugin.js";

/**
 * Fixed-timestep physics clock — decouples the simulation rate from the render
 * rate (Fiedler "fix your timestep"). Each render frame the accumulator absorbs
 * the variable `frameTime.dt`; the solver then runs a whole number of fixed
 * `fixedDt` steps (0, 1, or several), and `alpha` is the leftover fraction used
 * to interpolate the rendered pose between the last two simulated states.
 *
 * Default 60 Hz; set another rate at init with `setFixedTimestep(hz)`.
 */
export interface PhysicsClock {
    /** Fixed simulation step length, seconds (default 1/60). */
    readonly fixedDt: number;
    /** Unsimulated time carried to the next frame, seconds (< fixedDt). */
    readonly accumulator: number;
    /** accumulator / fixedDt ∈ [0,1): render interpolation fraction prev→current. */
    readonly alpha: number;
    /** Whole steps the solver should run this frame (0..maxSubSteps). */
    readonly steps: number;
    /** Cap on steps/frame — prevents the "spiral of death" after a long stall. */
    readonly maxSubSteps: number;
}

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
                // clamp the absorbed time to the step budget so a long stall (tab
                // backgrounded, GC) can't queue hundreds of steps (spiral of death)
                const acc = c.accumulator + Math.min(db.store.resources.frameTime.dt, h * c.maxSubSteps);
                const steps = Math.min(Math.floor(acc / h), c.maxSubSteps);
                db.store.resources.physicsClock = { ...c, accumulator: acc - steps * h, alpha: (acc - steps * h) / h, steps };
            },
        },
    },
});
