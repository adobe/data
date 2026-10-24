// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Failure, Warning } from '../../interface/report/failure.js';
import { idOrNull } from '../../interface/registry/index.js';

/** What went wrong in a run or tick, before the world spawns its report: empty lists and a zero when it's clean. */
export type RunReport = {
    readonly failures: readonly Failure[];
    readonly skipped: readonly string[];
    readonly dropped: number;
    readonly warnings: readonly Warning[];
};

/**
 * A failure of `of` as data, labeled by its `name` and its `id`, or for an item without `id` the id the plugin gave it:
 * an Error's message and stack, or String() of anything else thrown.
 */
export const failureOf = (kind: Failure["kind"], of: { readonly name: string; readonly id?: string | null }, error: unknown): Failure => {
    const { name } = of;
    const id = of.id !== undefined ? of.id : idOrNull(of);
    return error instanceof Error
        ? { kind, name, id, message: error.message, stack: typeof error.stack === "string" ? error.stack : null }
        : { kind, name, id, message: String(error), stack: null };
};
