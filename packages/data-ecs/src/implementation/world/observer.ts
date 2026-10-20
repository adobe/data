import type { Leaf } from '../../interface/system/leaf.js';
import type { Failure } from '../../interface/world/report.js';
import { labelOfItem } from '../../interface/registry/index.js';
import { readAhead, type ExecuteContext } from './execute.js';
import { failureOf } from './failures.js';
import { refreshUses } from './indexes.js';
import type { Runner } from './runner.js';
import { joinedOf, type JoinedObserver } from './joined-observer.js';

/**
 * Runs observer systems after a sync point, on this thread: those of the run, `own`, then those added, `added`, each
 * once. What the GPU wrote that they read, or their indexes hold by, is read back, then those indexes are refreshed;
 * then each runs, unless it was removed since, even by a body earlier in the pass. Returns `failures` with theirs, as
 * `"system"` failures, and the index conflicts refreshing found: a promise only when refreshing or reading back waited.
 */
export const runObserver = (context: ExecuteContext, own: readonly Leaf[], added: readonly Leaf[], failures: Failure[] | null): Failure[] | null | Promise<Failure[] | null> => {
    const ownPass = passOf(context, own, false);
    const addedPass = passOf(context, added, true);
    // Those on joined threads are posted there, which reads back and refreshes what they read itself.
    if (!ownPass.here && !addedPass.here) return context.state.indexFailures.length === 0 ? failures : runAll(context, own, added, ownPass, addedPass, failures);
    const waiting = ownPass.indexed || addedPass.indexed || context.state.gpu !== null ? prepare(context, ownPass, addedPass) : null;
    if (waiting !== null) return finishAfter(waiting, context, own, added, ownPass, addedPass, failures);
    return runAll(context, own, added, ownPass, addedPass, failures);
};

/**
 * A list's runners, read again once one was replaced or removed, or for another list; whether any looks up through an
 * index, and whether any runs on this thread rather than a joined one. A runner removed since it was read reads as
 * removed, so a pass in progress skips it.
 */
type Pass = { leaves: readonly Leaf[]; readonly runners: Runner[]; indexed: boolean; here: boolean; version: number; joined: readonly JoinedObserver[] | null };

/**
 * A context's passes: by list for runs' own observer systems, whose lists last as their schedules do; and one for those
 * added, whose list is new whenever one is added or removed.
 */
type Passes = { readonly own: WeakMap<readonly Leaf[], Pass>; readonly added: Pass };

const passes = new WeakMap<ExecuteContext, Passes>();
const noLeaves: readonly Leaf[] = [];
const emptyPass: Pass = { leaves: noLeaves, runners: [], indexed: false, here: false, version: -1, joined: [] };
const createPass = (leaves: readonly Leaf[]): Pass => ({ leaves, runners: [], indexed: false, here: false, version: -1, joined: null });

const passOf = (context: ExecuteContext, leaves: readonly Leaf[], added: boolean): Pass => {
    if (leaves.length === 0) return emptyPass;
    let all = passes.get(context);
    if (all === undefined) passes.set(context, all = { own: new WeakMap(), added: createPass(noLeaves) });
    let pass = added ? all.added : all.own.get(leaves);
    if (pass === undefined) all.own.set(leaves, pass = createPass(leaves));
    const { runnersVersion } = context.state;
    if (pass.version !== runnersVersion || pass.leaves !== leaves) {
        const { runners } = pass;
        runners.length = leaves.length;
        pass.leaves = leaves;
        pass.indexed = false;
        pass.here = false;
        pass.joined = null;
        for (let k = 0; k < leaves.length; k++) {
            const runner = runners[k] = context.runnerOf(leaves[k]);
            if (runner.indexes.length > 0) pass.indexed = true;
            if (runner.joined === null) pass.here = true;
        }
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
    const { gpu } = context.state;
    // What the GPU wrote is read back first, so the indexes refresh from the values it wrote.
    if (gpu !== null && gpu.anyAhead()) return readAhead(context.state, gpu, [...own.runners, ...added.runners]).then(() => refreshAll(context, own, added) ?? undefined);
    return refreshAll(context, own, added);
};

const refreshAll = (context: ExecuteContext, own: Pass, added: Pass): Promise<void> | null => {
    const waiting = refreshIndexes(context, added, refreshIndexes(context, own, null));
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

/**
 * The observer systems of a list placed on joined threads, which run there once posted (`joined-observer.ts`): a run's
 * own, or with `added`, those added.
 */
export const joinedIn = (context: ExecuteContext, leaves: readonly Leaf[], added: boolean): readonly JoinedObserver[] => {
    const pass = passOf(context, leaves, added);
    if (pass.joined === null) pass.joined = joinedOf(pass.runners);
    return pass.joined;
};

/**
 * Runs one observer system, adding its failure to `failures`. Its context has no commands, so its chunks hold none. One
 * on a joined thread runs there.
 */
const runOne = (leaf: Leaf, runner: Runner, failures: Failure[] | null): Failure[] | null => {
    if (runner.holdings.removed || runner.joined !== null) return failures;
    const chunks = runner.start(undefined, null, -1);
    for (let c = 0; c < chunks.length; c++) {
        const chunk = chunks[c];
        // An observer system runs here, as no kernel, so its chunks are settled.
        if (chunk instanceof Promise || chunk.error === undefined) continue;
        (failures ??= []).push(failureOf("system", labelOfItem(leaf), chunk.error));
        break;
    }
    return failures;
};
