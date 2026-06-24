// © 2026 Adobe. MIT License. See /LICENSE for details.

export * as FrameTime from "./public.js";

/**
 * Wall-clock timing for the current frame, published once per frame by
 * `FrameTime.plugin`. Any system that advances state over time reads this
 * instead of calling `performance.now()` and tracking its own `lastTime`.
 */
export interface FrameTime {
    /** `performance.now()` (ms) sampled at the start of this frame. */
    readonly now: number;
    /**
     * Seconds since the previous frame, clamped to a sane maximum so a
     * stalled tab or the first frame can't inject a huge time jump. A solver
     * that needs a tighter stability bound clamps `dt` further at its own seam.
     */
    readonly dt: number;
    /** Seconds since the plugin started — the running sum of clamped `dt`. */
    readonly elapsed: number;
}
