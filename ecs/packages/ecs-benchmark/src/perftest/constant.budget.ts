// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * How a benchmark warms up and is timed. On one world: at least `warmUp` milliseconds and `warmUpRuns` runs, enough for
 * V8 to optimize the bodies, tier WASM up from its baseline compiler and start the pool's workers, then after setting
 * up again `settleRuns` runs, which bring the pool's cores back up to speed, then `samples` timed samples. On new worlds: `warmUpWorlds` first, then at least `timedRuns` and `timed` milliseconds, up to
 * `maximumWorlds`.
 */
export const budget = { warmUp: 1000, warmUpRuns: 50, settleRuns: 200, samples: 30, warmUpWorlds: 3, timed: 1000, timedRuns: 10, maximumWorlds: 30 } as const;
