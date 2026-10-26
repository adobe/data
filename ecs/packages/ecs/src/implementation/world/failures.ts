// © 2026 Adobe. MIT License. See /LICENSE for details.
import { idOrNull } from '../../interface/registry/index.js';

/** What failed in a run or tick: a system, finalizer, GPU work, thread or unique index. */
export type Failure = {
    /**
     * A system or finalizer that threw, GPU work, a system whose thread is gone, which didn't run, a unique index
     * found holding two entities for one key, or the kernel pool's workers, failing to load kernels.
     */
    readonly kind: "system" | "finalizer" | "gpu" | "thread" | "index" | "workers";
    /** The label of what failed: for GPU work, of the system whose run submitted it. */
    readonly name: string;
    /** The id the plugin gave it; null without one. */
    readonly id: string | null;
    /** An Error's message, or String() of anything else thrown. */
    readonly message: string;
    /** What was thrown, the cause of the Error that reports it; undefined for an index's conflict. */
    readonly error: unknown;
    /** What failed, by identity: what's reported out of band is reported once while it keeps failing. */
    readonly subject: object;
};

/** Whether a body's value is a promise or another thenable, which a run never waits for. */
export const isThenable = (value: unknown): boolean =>
    (typeof value === "object" || typeof value === "function") && value !== null && typeof Reflect.get(value, "then") === "function";

/** What fails a system whose body returned a thenable. */
export const returnedPromise = "its body returned a promise, which nothing awaits: a body returns no promise; start the work, and finish it in a later run";

/** What ran but slowed a run: a system whose tier waited for the joined thread it runs on, as it isn't terminal. */
export type Warning = { readonly kind: "blocking"; readonly name: string; readonly id: string | null; readonly message: string };

/** What went wrong in a run or tick: empty lists and a zero when it's clean. `skipped` holds the systems not run. */
export type RunReport = {
    readonly failures: readonly Failure[];
    readonly skipped: readonly { readonly name: string }[];
    readonly dropped: number;
    readonly warnings: readonly Warning[];
};

/**
 * A failure of `of` as data, labeled by its `name` and its `id`, or for an item without `id` the id the plugin gave it:
 * an Error's message, or String() of anything else thrown. `subject` is what failed, `of` unless given.
 */
export const failureOf = (kind: Failure["kind"], of: { readonly name: string; readonly id?: string | null }, error: unknown, subject: object = of): Failure => {
    const { name } = of;
    const id = of.id !== undefined ? of.id : idOrNull(of);
    return { kind, name, id, message: error instanceof Error ? error.message : String(error), error, subject };
};

const kinds = { system: "System", finalizer: "Finalizer", gpu: "GPU work of system", thread: "System" } as const;

/** One failure as an Error: what failed, by its label and id, and its message, with what was thrown as its cause. */
export const errorOfFailure = (failure: Failure): Error => {
    const text = failure.kind === "index" ? failure.message
        : failure.kind === "workers" ? `The kernel pool's workers failed: ${failure.message}`
        : `${kinds[failure.kind]} "${failure.name}"${failure.id === null ? "" : ` (${failure.id})`} failed: ${failure.message}`;
    return failure.error === undefined ? new Error(text) : new Error(text, { cause: failure.error });
};

/**
 * What a run whose systems failed rejects with: its one failure's Error, or an AggregateError of each's, its message
 * naming them all and the systems skipped.
 */
export const errorOfRun = (report: RunReport): Error => {
    const errors = report.failures.map(errorOfFailure);
    const skipped = report.skipped.length === 0 ? "" : `; skipped: ${report.skipped.map(system => `"${system.name}"`).join(", ")}`;
    if (errors.length === 1 && skipped === "") return errors[0];
    if (errors.length === 1) return new Error(`${errors[0].message}${skipped}`, { cause: report.failures[0].error });
    return new AggregateError(errors, `${errors.length} failures: ${errors.map(error => error.message).join("; ")}${skipped}`);
};
