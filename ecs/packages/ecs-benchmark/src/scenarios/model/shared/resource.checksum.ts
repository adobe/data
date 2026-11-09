// © 2026 Adobe. MIT License. See /LICENSE for details.
/** The sum of every value a get read, so each read is used, as the suite's `benchmark::DoNotOptimize` makes it. */
export const checksum = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [checksum]: { type: number; reduce: "+" };
    }
}
