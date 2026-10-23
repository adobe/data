// © 2026 Adobe. MIT License. See /LICENSE for details.
import { register } from '../component/register.js';
import type { Failure, Warning } from './failure.js';

/**
 * What every run and tick reports, all structs, so every thread reads it: `number`, the run's own, every run and tick
 * taking the next in the order they ran; `elapsed`, milliseconds from its start to its sync point; `systems`, how many
 * ran; `workers`, how many pool workers took part; `joined`, how many joined threads ran its systems; `main`, whether
 * any ran on the main thread; `gpu`, whether it submitted GPU work; `dropped`, commands that did nothing, their entity
 * gone at the sync point.
 */
export const run = Symbol("Report/run");
/**
 * What went wrong, on a report only when something did: `failures`, systems, finalizers, GPU work, threads and unique
 * indexes that failed, in the order they ran or were found; `skipped`, the labels of systems that didn't run, those in
 * tiers after one that failed and those of a joined thread that's gone; `warnings`, what ran but slowed the run.
 */
export const errors = Symbol("Report/errors");

declare module '../component/types.js' {
    export interface Components {
        [run]: {
            type: {
                readonly number: number;
                readonly elapsed: number;
                readonly systems: number;
                readonly workers: number;
                readonly joined: number;
                readonly main: boolean;
                readonly gpu: boolean;
                readonly dropped: number;
            };
        };
        [errors]: { type: { readonly failures: readonly Failure[]; readonly skipped: readonly string[]; readonly warnings: readonly Warning[] } };
    }
}

const text = { type: "string" } as const;
const count = { type: "integer", minimum: 0 } as const;

register(run, {
    type: {
        type: "object",
        properties: {
            number: count, elapsed: { type: "number", minimum: 0 }, systems: count, workers: count, joined: count,
            main: { type: "boolean" }, gpu: { type: "boolean" }, dropped: count,
        },
    },
});
register(errors, {
    type: {
        type: "object",
        properties: {
            failures: {
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
            skipped: { type: "array", items: text },
            warnings: { type: "array", items: { type: "object", properties: { kind: { const: "blocking" }, name: text, message: text } } },
        },
    },
});
