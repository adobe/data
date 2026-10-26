// © 2026 Adobe. MIT License. See /LICENSE for details.
import { errorOfFailure, type Failure } from './failures.js';

/**
 * Raises an error out of band: through the platform's `reportError` where it has one, as browsers and their workers
 * do, so it's logged and dispatched as an `error` event; otherwise thrown from a task of its own, an uncaught
 * exception, as in node. Read each time, so a test can stand in for it.
 */
export const raise = (error: Error): void => {
    const report: unknown = Reflect.get(globalThis, "reportError");
    if (typeof report === "function") Reflect.apply(report, globalThis, [error]);
    else setTimeout(() => { throw error; }, 0);
};

/**
 * Failures no run rejects with, raised out of band: once per subject, a system, finalizer, index or GPU work, while
 * it keeps failing. The world tells it what recovered: a system or finalizer that ran without failing, an index a
 * tick found no conflict in, GPU work whose scopes gave no error. Once closed, as its world is disposed, it raises
 * nothing more. With nothing reported, what the world asks of it costs a size check.
 */
export const createOutOfBand = () => {
    /** Subjects reported and not known to have recovered, by the kind of their failure. */
    const reported = new Map<object, Failure["kind"]>();
    let closed = false;

    /** Raises a failure, unless its subject is reported already or this is closed. */
    const report = (failure: Failure): void => {
        if (closed || reported.has(failure.subject)) return;
        reported.set(failure.subject, failure.kind);
        raise(errorOfFailure(failure));
    };

    return {
        report,
        reportAll: (failures: readonly Failure[] | null): void => {
            if (failures !== null) for (let k = 0; k < failures.length; k++) report(failures[k]);
        },
        /** How many subjects are reported, still failing as far as it knows. */
        size: (): number => reported.size,
        has: (subject: object): boolean => reported.has(subject),
        /** Whether a subject of this kind is reported. */
        reports: (kind: Failure["kind"]): boolean => {
            for (const each of reported.values()) if (each === kind) return true;
            return false;
        },
        /** `subject` ran without failing, so its next failure is reported. */
        recovered: (subject: object): void => {
            if (reported.size !== 0) reported.delete(subject);
        },
        /** Indexes reported that none of `failures` names recovered, as a tick found no conflict in them. */
        indexesRecovered: (failures: readonly Failure[]): void => {
            for (const [subject, kind] of reported) if (kind === "index" && !failures.some(failure => failure.subject === subject)) reported.delete(subject);
        },
        close: (): void => {
            closed = true;
            reported.clear();
        },
    };
};

export type OutOfBand = ReturnType<typeof createOutOfBand>;
