import type { Leaf } from '../../interface/system/leaf.js';
import type { Failure } from '../../interface/world/report.js';
import { labelOfItem } from '../../interface/registry/index.js';
import { readAhead, type ExecuteContext } from './execute.js';
import { failureOf } from './failures.js';
import { refreshUses } from './indexes.js';
import type { Runner } from './runner.js';

/**
 * Runs synced systems after a sync point, on this thread: those of the run, `own`, then those added, `added`, each once.
 * The indexes they look up through are refreshed and what the GPU wrote that they read is read back first; then each
 * runs, unless it was removed since, even by a body earlier in the pass. Returns `failures` with theirs, as `"system"`
 * failures, and the index conflicts refreshing found: a promise only when refreshing or reading back waited.
 */
export const runSynced = (context: ExecuteContext, own: readonly Leaf[], added: readonly Leaf[], failures: Failure[] | null): Failure[] | null | Promise<Failure[] | null> => {
    const ownPass = passOf(context, own);
    const addedPass = passOf(context, added);
    const waiting = ownPass.indexed || addedPass.indexed || context.state.gpu !== null ? prepare(context, ownPass, addedPass) : null;
    if (waiting !== null) return finishAfter(waiting, context, own, added, ownPass, addedPass, failures);
    return runAll(context, own, added, ownPass, addedPass, failures);
};

/**
 * A list's runners, read again once one was replaced or removed, and whether any looks up through an index. A runner
 * removed since it was read reads as removed, so a pass in progress skips it.
 */
type Pass = { readonly runners: Runner[]; indexed: boolean; version: number };

const passes = new WeakMap<ExecuteContext, WeakMap<readonly Leaf[], Pass>>();
const emptyPass: Pass = { runners: [], indexed: false, version: -1 };

const passOf = (context: ExecuteContext, leaves: readonly Leaf[]): Pass => {
    if (leaves.length === 0) return emptyPass;
    let byList = passes.get(context);
    if (byList === undefined) passes.set(context, byList = new WeakMap());
    let pass = byList.get(leaves);
    if (pass === undefined) byList.set(leaves, pass = { runners: [], indexed: false, version: -1 });
    const { runnersVersion } = context.state;
    if (pass.version !== runnersVersion) {
        const { runners } = pass;
        runners.length = leaves.length;
        pass.indexed = false;
        for (let k = 0; k < leaves.length; k++) if ((runners[k] = context.runnerOf(leaves[k])).indexes.length > 0) pass.indexed = true;
        pass.version = runnersVersion;
    }
    return pass;
};

/** Refreshes the indexes of a pass's runners, adding what to wait for to `waiting`. */
const refreshIndexes = (context: ExecuteContext, pass: Pass, waiting: Promise<unknown>[] | null): Promise<unknown>[] | null => {
    if (!pass.indexed) return waiting;
    let pending = waiting;
    for (const { indexes } of pass.runners) {
        if (indexes.length === 0) continue;
        const building = refreshUses(context.state, indexes, context.workers?.pool ?? null);
        if (building !== null) (pending ??= []).push(building);
    }
    return pending;
};

/**
 * Refreshes the indexes the systems look up through, and reads back what the GPU wrote that they read; returns what to
 * wait for, or null when nothing waits.
 */
const prepare = (context: ExecuteContext, own: Pass, added: Pass): Promise<void> | null => {
    const { state } = context;
    let waiting = refreshIndexes(context, added, refreshIndexes(context, own, null));
    const { gpu } = state;
    if (gpu !== null && gpu.anyAhead()) (waiting ??= []).push(readAhead(state, gpu, [...own.runners, ...added.runners]));
    return waiting === null ? null : Promise.all(waiting).then(() => undefined);
};

const finishAfter = async (waiting: Promise<void>, context: ExecuteContext, own: readonly Leaf[], added: readonly Leaf[], ownPass: Pass, addedPass: Pass, failures: Failure[] | null): Promise<Failure[] | null> => {
    await waiting;
    return runAll(context, own, added, ownPass, addedPass, failures);
};

const runAll = (context: ExecuteContext, own: readonly Leaf[], added: readonly Leaf[], ownPass: Pass, addedPass: Pass, failures: Failure[] | null): Failure[] | null => {
    const { state } = context;
    let failed = failures;
    if (state.indexFailures.length !== 0) (failed ??= []).push(...state.indexFailures.splice(0));
    for (let k = 0; k < own.length; k++) failed = runOne(own[k], ownPass.runners[k], failed);
    const { runners } = addedPass;
    for (let k = 0; k < added.length; k++) {
        // One the run holds too ran with the run's.
        if (own.length === 0 || !own.includes(added[k])) failed = runOne(added[k], runners[k], failed);
    }
    return failed;
};

/** Runs one synced system, adding its failure to `failures`. Its context has no commands, so its chunks hold none. */
const runOne = (leaf: Leaf, runner: Runner, failures: Failure[] | null): Failure[] | null => {
    if (runner.holdings.removed) return failures;
    const chunks = runner.start(undefined, null, -1);
    for (let c = 0; c < chunks.length; c++) {
        const chunk = chunks[c];
        // A synced system runs here, as no kernel, so its chunks are settled.
        if (chunk instanceof Promise || chunk.error === undefined) continue;
        (failures ??= []).push(failureOf("system", labelOfItem(leaf), chunk.error));
        break;
    }
    return failures;
};
