// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * How a benchmark warms up and is timed. On one world: `warmUpRuns` runs, enough for V8 to optimize the bodies and
 * tier WASM up from its baseline compiler, then `samples` timed samples. On new worlds: `warmUpWorlds` first, then at
 * least `timedRuns` and a second's worth, in milliseconds `timed`, up to `maximumWorlds`.
 */
export const budget = { warmUpRuns: 50, samples: 30, warmUpWorlds: 3, timed: 1000, timedRuns: 10, maximumWorlds: 30 } as const;
