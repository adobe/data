// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * How long a benchmark warms up and is timed, in milliseconds, and the fewest runs and worlds of each. Warming up a
 * second and twenty runs lets V8 optimize the bodies and tier WASM up from its baseline compiler before anything is
 * timed; timing a second or more takes in the collections its allocations cause.
 */
export const budget = { warmUp: 1000, warmUpRuns: 20, warmUpWorlds: 3, timed: 1000, timedRuns: 10, maximumRuns: 10000, maximumWorlds: 30 } as const;
