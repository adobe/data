// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Finalizer } from '../../interface/system/finalizer.js';
import type { Rule } from '../../interface/component/rule.js';
import type { RuleFacts } from '../../interface/registry/strata.js';
import { createFinalizerRunner, finalizeEvery, followResources, placeFinalizer, refreshFinalizerIndexes, watchedResourcesOf, type FinalizerRunner, type Thrown } from './finalizers.js';
import { watchResource } from './resource-changes.js';
import { finalizerKeysOf, type TaskChannel } from './remote-systems.js';
import { programRules, programVersion } from '../../interface/registry/program.js';
import { triggersOf } from './program.js';
import { ensureResources, findResource } from './resources.js';
import { idOf, metIdOf, type Key, type State } from './state.js';
import { restratify } from './structure.js';
import { idOfItem, idOfKey, keysVersion, labelOf, threadOf } from '../../interface/registry/index.js';

/**
 * Why a joined thread that imported the items of ids `imported` can't claim `threads`: a removed system added to the
 * world on one that it never imported, or that has no id or names a key without one, so it can't name it; null when
 * none.
 */
export const finalizerCrossing = (state: State, threads: readonly string[], imported: ReadonlySet<string>): string | null => {
    for (const finalizer of state.added) {
        if (finalizer.kind !== "finalizer") continue;
        const thread = threadOf(finalizer.declaration, "Removed system", finalizer.name);
        if (thread === null || !threads.includes(thread)) continue;
        const label = finalizer.name;
        const id = idOfItem(finalizer);
        if (id === undefined) return `Removed system "${label}" runs on thread "${thread}" and has no id, so a joined thread can't run it; the build gives top-level systems one.`;
        if (!imported.has(id)) return `Removed system "${label}" runs on thread "${thread}", which the joined thread claiming it never imported.`;
        const unnamed = finalizerKeysOf(finalizer).find(key => idOfKey(key) === undefined);
        if (unnamed !== undefined) return `Removed system "${label}" runs on thread "${thread}" and names "${labelOf(unnamed)}", which has no id, so a joined thread can't name it; the build gives top-level keys one.`;
    }
    return null;
};

/** The channel of the joined thread a finalizer runs on, or null for the world's thread. */
const channelOf = (state: State, finalizer: Finalizer): TaskChannel | null => {
    if (!state.claimed || finalizer.kind !== "finalizer") return null;
    const thread = threadOf(finalizer.declaration, "Removed system", finalizer.name);
    const channel = thread === null ? undefined : state.threadTasks.get(thread);
    return channel === undefined || channel.gone() ? null : channel;
};

/**
 * Places a runner on its joined thread, or here: false when that thread can't name it, which the next sync point
 * reports once.
 */
const placed = (state: State, runner: FinalizerRunner): boolean => {
    try {
        placeFinalizer(state, runner, channelOf(state, runner.finalizer));
        return true;
    }
    catch (error) {
        if (!state.unplacedSeen.has(runner.finalizer)) {
            state.unplacedSeen.add(runner.finalizer);
            state.unplaced.push({ finalizer: runner.finalizer, error });
        }
        return false;
    }
};

/**
 * Between runs, once claims were made or released: each active finalizer runs on the joined thread filling its thread,
 * or here. One its thread can't name stops being active, and activates again once its thread is released.
 */
export const placeFinalizers = (state: State): void => {
    const kept = state.finalizers.filter(runner => (channelOf(state, runner.finalizer) ?? null) === (runner.remote?.channel ?? null) || placed(state, runner));
    if (kept.length === state.finalizers.length) return;
    for (const runner of state.finalizers) if (!kept.includes(runner)) state.activated.delete(runner.finalizer);
    state.finalizers.splice(0, state.finalizers.length, ...kept);
};

/** The resources a finalizer reads, writes or, for a changes finalizer, watches. */
const resourcesOf = (finalizer: Finalizer): readonly Key[] => [
    ...finalizer.declaration.resources?.read ?? [], ...finalizer.declaration.resources?.write ?? [],
    ...finalizer.kind === "changes" ? watchedResourcesOf(finalizer.declaration.watch) : [],
];

/**
 * What a world ensured of its added finalizers' resources: the version of the list of them then, and the keys' while a
 * changes system watches resources by a trait, which a resource registering later may declare.
 */
export type Ensured = { version: number; keys: number; traits: boolean };

/** Whether the added finalizers may use a resource the world hasn't ensured. */
export const addedResourcesChanged = (state: State, ensured: Ensured): boolean => ensured.version !== state.addedVersion || (ensured.traits && ensured.keys !== keysVersion());

/** Between runs: adds the resources of every finalizer added to the world, so one can activate at any sync point. */
export const ensureAddedResources = (state: State, ensured: Ensured): void => {
    if (!addedResourcesChanged(state, ensured)) return;
    ensured.version = state.addedVersion;
    ensured.keys = keysVersion();
    ensured.traits = state.added.some(finalizer => finalizer.kind === "changes" && finalizer.declaration.watch.resourceTraits.length > 0);
    ensureResources(state, new Set(state.added.flatMap(resourcesOf)));
    // A watched resource is followed from now, before its finalizer activates, so writes before then are seen.
    for (const finalizer of state.added) {
        if (finalizer.kind === "changes") for (const key of watchedResourcesOf(finalizer.declaration.watch)) watchResource(state, idOf(state, key));
    }
    // Active finalizers watching resources by a trait follow those registered since.
    for (const runner of state.finalizers) if (runner.finalizer.kind === "changes") followResources(state, runner.finalizer.declaration.watch, runner.resourceWatches);
    // Finalizers waiting for these can activate at the next sync point.
    state.activation.met = true;
};

const ready = (state: State, item: Rule | Finalizer): boolean => {
    const { keys, any } = triggersOf(item);
    return keys.length === 0 || (any ? keys.some(key => metIdOf(state, key) !== undefined) : keys.every(key => metIdOf(state, key) !== undefined));
};

/**
 * At the start of a sync point: activates the program's rules and the added finalizers that can match here now, so they apply
 * from this sync point on. Until the world has met each component one needs, nothing can match it. Activating
 * resolves its components' ids, which may make more ready.
 */
export const activate = (state: State): void => {
    if (activationPending(state)) activateNow(state);
};

/** Whether a rule or added finalizer may be ready to activate: a component met, a finalizer added, or the program changed. */
export const activationPending = (state: State): boolean => state.activation.met || state.activation.version !== programVersion();

/** `activate` once something may be ready: apart, so a sync point with nothing to activate allocates no closure context. */
const activateNow = (state: State): void => {
    const { activation, activated, structure } = state;
    const facts: RuleFacts[] = [];
    const runners = new Map<Finalizer, FinalizerRunner>();
    while (activation.met || activation.version !== programVersion()) {
        activation.met = false;
        activation.version = programVersion();
        for (const rule of programRules()) {
            if (activated.has(rule) || !ready(state, rule)) continue;
            activated.add(rule);
            const { components, derive } = rule.declaration;
            const ids = (keys: readonly Key[]): number[] => keys.map(key => idOf(state, key));
            facts.push({ has: ids(components.has ?? []), not: ids(components.not ?? []), derives: ids(derive) });
        }
        for (const finalizer of state.added) {
            // A finalizer added during a run waits for its resources, which are added between runs.
            if (activated.has(finalizer) || !ready(state, finalizer) || resourcesOf(finalizer).some(key => findResource(state, key) === undefined)) continue;
            // One a joined thread runs is placed there; one it can't name doesn't activate, which the sync point reports once.
            if (state.unplacedSeen.has(finalizer)) continue;
            const runner = createFinalizerRunner(state, finalizer);
            if (!placed(state, runner)) continue;
            activated.add(finalizer);
            runners.set(finalizer, runner);
        }
    }
    if (facts.length > 0) {
        restratify(structure, [...structure.rules, ...facts], structure.hosts, id => labelOf(state.keys[id]));
        // Entities may already match a rule added to the program after the world met its components.
        structure.rederive = true;
    }
    if (runners.size > 0) {
        const existing = new Map(state.finalizers.map(runner => [runner.finalizer, runner]));
        orderRunners(state, finalizer => runners.get(finalizer) ?? existing.get(finalizer));
    }
};

/**
 * Orders the world's runners as its added finalizers are: those `runnerOf` gives, and those removed but not yet
 * released last, as they were, so they keep running until they're released.
 */
const orderRunners = (state: State, runnerOf: (finalizer: Finalizer) => FinalizerRunner | undefined): void => {
    const ordered = state.added.flatMap(finalizer => runnerOf(finalizer) ?? []);
    for (const runner of state.finalizers) if (!ordered.includes(runner)) ordered.push(runner);
    state.finalizers.splice(0, state.finalizers.length, ...ordered);
};

/** Once the added finalizers' order changed: their runners run in it. */
export const reorderRunners = (state: State): void => {
    const existing = new Map(state.finalizers.map(runner => [runner.finalizer, runner]));
    orderRunners(state, finalizer => existing.get(finalizer));
};

/**
 * Between runs, once finalizers were removed from the world: each no longer added stops, a removed system running
 * first for every entity it still matches, here or on its joined thread. Returns what they threw here.
 */
export const releaseFinalizers = (state: State): Thrown[] => {
    const errors: Thrown[] = [];
    const released = state.finalizers.filter(runner => !state.added.includes(runner.finalizer));
    if (released.length === 0) return errors;
    refreshFinalizerIndexes(state);
    for (const runner of released) {
        const { finalizer, remote } = runner;
        if (remote !== null) remote.channel.releaseFinalizer(remote.index);
        else if (finalizer.kind === "finalizer") {
            errors.push(...finalizeEvery(state, runner));
            // Its commands apply at the next sync point.
            if (runner.target.buffer.count > 0) state.queued.push({ buffer: runner.target.buffer, guarded: true });
        }
        state.activated.delete(finalizer);
        state.unplacedSeen.delete(finalizer);
        runner.indexes.release();
    }
    state.finalizers.splice(0, state.finalizers.length, ...state.finalizers.filter(runner => !released.includes(runner)));
    return errors;
};
