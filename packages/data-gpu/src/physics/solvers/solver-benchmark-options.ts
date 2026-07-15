// © 2026 Adobe. MIT License. See /LICENSE for details.

export interface SolverBenchmarkOptions {
    /** Dynamic bodies dropped into the scene (≈ workload size). Default 256. */
    bodies?: number;
    /** Timed frames. Default 300. */
    frames?: number;
    /** Warm-up frames before timing. Default 90. */
    warmupFrames?: number;
    /** Fixed timestep per frame (seconds). Default 1/60. */
    dt?: number;
    /** Fraction of `bodies` that are spheres (rest are boxes). Default 0.5. */
    sphereFraction?: number;
    /** Extra static collider boxes as resting scenery. Default 0. */
    staticBodies?: number;
}
