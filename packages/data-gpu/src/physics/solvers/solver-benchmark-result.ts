// © 2026 Adobe. MIT License. See /LICENSE for details.

export interface SolverBenchmarkResult {
    bodies: number;
    frames: number;
    /** Total wall-clock time of the timed frames (ms). */
    totalMs: number;
    /** Mean cost of one frame (ms). */
    msPerFrame: number;
    /** Simulation frames per real second. */
    simFps: number;
    /** Slowest single frame (ms). */
    maxFrameMs: number;
    avgY: number;
    maxSpeed: number;
    belowFloor: number;
}
