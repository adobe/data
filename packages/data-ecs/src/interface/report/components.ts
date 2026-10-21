import { register } from '../component/register.js';
import type { Failure, Warning } from './failure.js';

/** The number of the run or tick a report is of. */
export const run = Symbol("Report/run");
/** Systems, finalizers, GPU work, threads and unique indexes that failed, in the order they ran or were found. */
export const failures = Symbol("Report/failures");
/**
 * The labels of systems that didn't run: those in tiers after one that failed, and those of a joined thread that's
 * gone, each with a `"thread"` failure.
 */
export const skipped = Symbol("Report/skipped");
/** Commands that did nothing, since their entity wasn't alive at the sync point. */
export const dropped = Symbol("Report/dropped");
/** What ran but slowed the run. */
export const warnings = Symbol("Report/warnings");

declare module '@adobe/data-ecs' {
    export interface Components {
        [run]: { type: number };
        [failures]: { type: readonly Failure[] };
        [skipped]: { type: readonly string[] };
        [dropped]: { type: number };
        [warnings]: { type: readonly Warning[] };
    }
}

const text = { type: "string" } as const;

register(run, { type: { type: "integer", minimum: 0 } });
register(failures, {
    type: {
        type: "array",
        items: {
            type: "object",
            properties: {
                kind: { anyOf: [{ const: "system" }, { const: "finalizer" }, { const: "gpu" }, { const: "thread" }, { const: "index" }] },
                name: text,
                message: text,
                stack: { anyOf: [text, { type: "null" }] },
            },
        },
    },
});
register(skipped, { type: { type: "array", items: text } });
register(dropped, { type: { type: "integer", minimum: 0 } });
register(warnings, {
    type: { type: "array", items: { type: "object", properties: { kind: { const: "blocking" }, name: text, message: text } } },
});
