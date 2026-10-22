import type { Failure, Warning } from '../../interface/report/failure.js';

/** What went wrong in a run or tick, before the world spawns its report: empty lists and a zero when it's clean. */
export type RunReport = {
    readonly failures: readonly Failure[];
    readonly skipped: readonly string[];
    readonly dropped: number;
    readonly warnings: readonly Warning[];
};

/** A failure as data: an Error's message and stack, or String() of anything else thrown. */
export const failureOf = (kind: Failure["kind"], name: string, error: unknown): Failure => error instanceof Error
    ? { kind, name, message: error.message, stack: typeof error.stack === "string" ? error.stack : null }
    : { kind, name, message: String(error), stack: null };
