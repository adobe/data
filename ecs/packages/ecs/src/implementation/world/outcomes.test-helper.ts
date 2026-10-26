// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Input } from "../../interface/system/input.js";
import type { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { recorderOf, type Outcome } from "./create.js";
import type { Failure, Warning } from "./failures.js";

/** What a run went through, as data: what failed, the labels of the systems it skipped, what it dropped, its warnings. */
export type Reported = {
    readonly failures: readonly Failure[];
    readonly skipped: readonly string[];
    readonly dropped: number;
    readonly warnings: readonly Warning[];
};

/** What a run or tick ran, and where. */
export type Ran = Pick<Outcome, "systems" | "workers" | "joined" | "main" | "gpu">;

const reportedOf = ({ failures, skipped, dropped, warnings }: Outcome): Reported => ({ failures, skipped: skipped.map(system => system.name), dropped, warnings });

/**
 * Runs a system on a world `createWorld` made, and gives what the run went through, whether it resolved or rejected,
 * with what it resolved to or rejected with; rejects as the run does when it failed before its systems ran.
 */
export const runOutcome = async <I, R>(world: World, system: System<I, R>, ...input: Input<NoInfer<I>>): Promise<{ readonly outcome: Outcome; readonly value: R | undefined; readonly error: unknown }> => {
    recorderOf(world);
    return outcomeOf(world, world.run(system, ...input));
};

/**
 * What a run went through, by the promise its `run` returned, whether it resolved or rejected, with what it resolved to
 * or rejected with; rejects as the run does when it failed before its systems ran. Its world must have been recording
 * outcomes (`recorderOf`) before it was run.
 */
export const outcomeOf = async <R>(world: World, running: Promise<R>): Promise<{ readonly outcome: Outcome; readonly value: R | undefined; readonly error: unknown }> => {
    const record = recorderOf(world).runs.get(running);
    if (record === undefined) {
        // Rejected before it was queued, or queued before its world recorded outcomes.
        await running;
        throw new Error("The run was queued before its world recorded outcomes.");
    }
    let value: R | undefined = undefined;
    let error: unknown = undefined;
    let rejected = false;
    try {
        value = await running;
    }
    catch (thrown) {
        rejected = true;
        error = thrown;
    }
    if (record.outcome === null) throw rejected ? error : new Error("The run gave no outcome.");
    return { outcome: record.outcome, value, error };
};

/** What a run went through, by its promise, as `runReported` gives it. */
export const reportOf = async (world: World, running: Promise<unknown>): Promise<Reported> => reportedOf((await outcomeOf(world, running)).outcome);

/** Runs a system, then gives what its run went through. */
export const runReported = async <I, R>(world: World, system: System<I, R>, ...input: Input<NoInfer<I>>): Promise<Reported> =>
    reportedOf((await runOutcome(world, system, ...input)).outcome);

/** Runs a system, then gives what its run ran, and where. */
export const runRan = async <I, R>(world: World, system: System<I, R>, ...input: Input<NoInfer<I>>): Promise<Ran> => {
    const { systems, workers, joined, main, gpu } = (await runOutcome(world, system, ...input)).outcome;
    return { systems, workers, joined, main, gpu };
};

/** What every run on a world's thread goes through from now on, joined threads' included, in the order they settle. */
export const followRuns = (world: World): Reported[] => {
    const seen: Reported[] = [];
    recorderOf(world).each.push(outcome => seen.push(reportedOf(outcome)));
    return seen;
};

/**
 * Follows a world's ticks: `seen` lists each tick's report once its tails are done, and `until` resolves with the
 * first one a test passes, once one does.
 */
export const followTicks = (world: World) => {
    const seen: Reported[] = [];
    const waiting: (() => void)[] = [];
    const listener = (outcome: Outcome): void => {
        seen.push(reportedOf(outcome));
        for (const wake of waiting.splice(0)) wake();
    };
    const { ticks } = recorderOf(world);
    ticks.push(listener);
    const until = async (test: (report: Reported) => boolean): Promise<Reported> => {
        for (;;) {
            const found = seen.find(test);
            if (found !== undefined) return found;
            await new Promise<void>(resolve => waiting.push(resolve));
        }
    };
    return {
        seen, until, stop: () => {
            const at = ticks.indexOf(listener);
            if (at >= 0) ticks.splice(at, 1);
        },
    };
};

/**
 * Stands in for the platform's `reportError` until disposed, so what worlds report out of band is collected in
 * `errors` rather than raised: `until` resolves once one a test passes is.
 */
export const catchOutOfBand = () => {
    const errors: Error[] = [];
    const waiting: (() => void)[] = [];
    const had = Object.hasOwn(globalThis, "reportError");
    const previous: unknown = Reflect.get(globalThis, "reportError");
    Reflect.set(globalThis, "reportError", (error: Error) => {
        errors.push(error);
        for (const wake of waiting.splice(0)) wake();
    });
    const until = async (test: (error: Error) => boolean): Promise<Error> => {
        for (;;) {
            const found = errors.find(test);
            if (found !== undefined) return found;
            await new Promise<void>(resolve => waiting.push(resolve));
        }
    };
    return {
        errors,
        until,
        /** Resolves once `count` errors were reported. */
        count: async (count: number): Promise<void> => {
            while (errors.length < count) await new Promise<void>(resolve => waiting.push(resolve));
        },
        /** The messages of what was reported. */
        messages: (): string[] => errors.map(error => error.message),
        [Symbol.dispose]: (): void => {
            if (had) Reflect.set(globalThis, "reportError", previous);
            else Reflect.deleteProperty(globalThis, "reportError");
        },
    };
};
