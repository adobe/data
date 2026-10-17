import type { Failure } from '../../interface/world/report.js';

/** A failure as data: an Error's message and stack, or String() of anything else thrown. */
export const failureOf = (kind: Failure["kind"], name: string, error: unknown): Failure => error instanceof Error
    ? { kind, name, message: error.message, stack: typeof error.stack === "string" ? error.stack : null }
    : { kind, name, message: String(error), stack: null };
