// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Fixed-timestep physics clock state — decouples simulation rate from render rate.
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
