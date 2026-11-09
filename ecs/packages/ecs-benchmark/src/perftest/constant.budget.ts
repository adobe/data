// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * How long a benchmark warms up and is timed, in milliseconds, and the fewest runs of each. Timing a second or more
 * takes in the collections its allocations cause.
 */
export const budget = { warmUp: 200, warmUpRuns: 3, timed: 1000, timedRuns: 10, maximumRuns: 10000, maximumWorlds: 30 } as const;
