// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { SyncSystem } from '../../interface/system/sync-system.js';
import type { Derivation } from '../../interface/component/derivation.js';
import type { DerivationFacts } from '../../interface/registry/strata.js';
import { createSyncSystemRunner, runRemovedForEvery, followResources, placeSyncSystem, refreshSyncSystemIndexes, watchedResourcesOf, type SyncSystemRunner, type Thrown } from './sync-systems.js';
import { watchResource } from './resource-changes.js';
import { syncSystemKeysOf, type TaskChannel } from './remote-systems.js';
import { programDerivations, programVersion } from '../../interface/registry/program.js';
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
export const syncSystemCrossing = (state: State, threads: readonly string[], imported: ReadonlySet<string>): string | null => {
    for (const syncSystem of state.added) {
        if (syncSystem.kind !== "removed") continue;
        const thread = threadOf(syncSystem.declaration, "Removed system", syncSystem.name);
        if (thread === null || !threads.includes(thread)) continue;
        const label = syncSystem.name;
        const id = idOfItem(syncSystem);
        if (id === undefined) return `Removed system "${label}" runs on thread "${thread}" and has no id, so a joined thread can't run it; the build gives top-level systems one.`;
        if (!imported.has(id)) return `Removed system "${label}" runs on thread "${thread}", which the joined thread claiming it never imported.`;
        const unnamed = syncSystemKeysOf(syncSystem).find(key => idOfKey(key) === undefined);
        if (unnamed !== undefined) return `Removed system "${label}" runs on thread "${thread}" and names "${labelOf(unnamed)}", which has no id, so a joined thread can't name it; the build gives top-level keys one.`;
    }
    return null;
};

/** The channel of the joined thread a sync system runs on, or null for the world's thread. */
const channelOf = (state: State, syncSystem: SyncSystem): TaskChannel | null => {
    if (!state.claimed || syncSystem.kind !== "removed") return null;
    const thread = threadOf(syncSystem.declaration, "Removed system", syncSystem.name);
    const channel = thread === null ? undefined : state.threadTasks.get(thread);
    return channel === undefined || channel.gone() ? null : channel;
};

/**
 * Places a runner on its joined thread, or here: false when that thread can't name it, which the next sync point
 * reports once.
 */
const placed = (state: State, runner: SyncSystemRunner): boolean => {
    try {
        placeSyncSystem(state, runner, channelOf(state, runner.syncSystem));
        return true;
    }
    catch (error) {
        if (!state.unplacedSeen.has(runner.syncSystem)) {
            state.unplacedSeen.add(runner.syncSystem);
            state.unplaced.push({ syncSystem: runner.syncSystem, error });
        }
        return false;
    }
};

/**
 * Between runs, once claims were made or released: each active sync system runs on the joined thread filling its thread,
 * or here. One its thread can't name stops being active, and activates again once its thread is released.
 */
export const placeSyncSystems = (state: State): void => {
    const kept = state.syncSystems.filter(runner => (channelOf(state, runner.syncSystem) ?? null) === (runner.remote?.channel ?? null) || placed(state, runner));
    if (kept.length === state.syncSystems.length) return;
    for (const runner of state.syncSystems) if (!kept.includes(runner)) state.activated.delete(runner.syncSystem);
    state.syncSystems.splice(0, state.syncSystems.length, ...kept);
};

/** The resources a sync system reads, writes or, for a changes system, watches. */
const resourcesOf = (syncSystem: SyncSystem): readonly Key[] => [
    ...syncSystem.declaration.resources?.read ?? [], ...syncSystem.declaration.resources?.write ?? [],
    ...syncSystem.kind === "changes" ? watchedResourcesOf(syncSystem.declaration.watch) : [],
];

/**
 * What a world ensured of its added sync systems' resources: the version of the list of them then, and the keys' while a
 * changes system watches resources by a trait, which a resource registering later may declare.
 */
export type Ensured = { version: number; keys: number; traits: boolean };

/** Whether the added sync systems may use a resource the world hasn't ensured. */
export const addedResourcesChanged = (state: State, ensured: Ensured): boolean => ensured.version !== state.addedVersion || (ensured.traits && ensured.keys !== keysVersion());

/** Between runs: adds the resources of every sync system added to the world, so one can activate at any sync point. */
export const ensureAddedResources = (state: State, ensured: Ensured): void => {
    if (!addedResourcesChanged(state, ensured)) return;
    ensured.version = state.addedVersion;
    ensured.keys = keysVersion();
    ensured.traits = state.added.some(syncSystem => syncSystem.kind === "changes" && syncSystem.declaration.watch.resourceTraits.length > 0);
    ensureResources(state, new Set(state.added.flatMap(resourcesOf)));
    // A watched resource is followed from now, before its sync system activates, so writes before then are seen.
    for (const syncSystem of state.added) {
        if (syncSystem.kind === "changes") for (const key of watchedResourcesOf(syncSystem.declaration.watch)) watchResource(state, idOf(state, key));
    }
    // Active sync systems watching resources by a trait follow those registered since.
    for (const runner of state.syncSystems) if (runner.syncSystem.kind === "changes") followResources(state, runner.syncSystem.declaration.watch, runner.resourceWatches);
    // Sync systems waiting for these can activate at the next sync point.
    state.activation.met = true;
};

const ready = (state: State, item: Derivation | SyncSystem): boolean => {
    const { keys, any } = triggersOf(item);
    return keys.length === 0 || (any ? keys.some(key => metIdOf(state, key) !== undefined) : keys.every(key => metIdOf(state, key) !== undefined));
};

/**
 * At the start of a sync point: activates the program's derivations and the added sync systems that can match here now, so they apply
 * from this sync point on. Until the world has met each component one needs, nothing can match it. Activating
 * resolves its components' ids, which may make more ready.
 */
export const activate = (state: State): void => {
    if (activationPending(state)) activateNow(state);
};

/** Whether a derivation or added sync system may be ready to activate: a component met, a sync system added, or the program changed. */
export const activationPending = (state: State): boolean => state.activation.met || state.activation.version !== programVersion();

/** `activate` once something may be ready: apart, so a sync point with nothing to activate allocates no closure context. */
const activateNow = (state: State): void => {
    const { activation, activated, structure } = state;
    const facts: DerivationFacts[] = [];
    const runners = new Map<SyncSystem, SyncSystemRunner>();
    while (activation.met || activation.version !== programVersion()) {
        activation.met = false;
        activation.version = programVersion();
        for (const derivation of programDerivations()) {
            if (activated.has(derivation) || !ready(state, derivation)) continue;
            activated.add(derivation);
            const { components, derive } = derivation.declaration;
            const ids = (keys: readonly Key[]): number[] => keys.map(key => idOf(state, key));
            facts.push({ has: ids(components.has ?? []), not: ids(components.not ?? []), derives: ids(derive) });
        }
        for (const syncSystem of state.added) {
            // A sync system added during a run waits for its resources, which are added between runs.
            if (activated.has(syncSystem) || !ready(state, syncSystem) || resourcesOf(syncSystem).some(key => findResource(state, key) === undefined)) continue;
            // One a joined thread runs is placed there; one it can't name doesn't activate, which the sync point reports once.
            if (state.unplacedSeen.has(syncSystem)) continue;
            const runner = createSyncSystemRunner(state, syncSystem);
            if (!placed(state, runner)) continue;
            activated.add(syncSystem);
            runners.set(syncSystem, runner);
        }
    }
    if (facts.length > 0) {
        restratify(structure, [...structure.derivations, ...facts], structure.hosts, id => labelOf(state.keys[id]));
        // Entities may already match a derivation added to the program after the world met its components.
        structure.rederive = true;
    }
    if (runners.size > 0) {
        const existing = new Map(state.syncSystems.map(runner => [runner.syncSystem, runner]));
        orderRunners(state, syncSystem => runners.get(syncSystem) ?? existing.get(syncSystem));
    }
};

/**
 * Orders the world's runners as its added sync systems are: those `runnerOf` gives, and those removed but not yet
 * released last, as they were, so they keep running until they're released.
 */
const orderRunners = (state: State, runnerOf: (syncSystem: SyncSystem) => SyncSystemRunner | undefined): void => {
    const ordered = state.added.flatMap(syncSystem => runnerOf(syncSystem) ?? []);
    for (const runner of state.syncSystems) if (!ordered.includes(runner)) ordered.push(runner);
    state.syncSystems.splice(0, state.syncSystems.length, ...ordered);
};

/** Once the added sync systems' order changed: their runners run in it. */
export const reorderRunners = (state: State): void => {
    const existing = new Map(state.syncSystems.map(runner => [runner.syncSystem, runner]));
    orderRunners(state, syncSystem => existing.get(syncSystem));
};

/**
 * Between runs, once sync systems were removed from the world: each no longer added stops, a removed system running
 * first for every entity it still matches, here or on its joined thread. Returns what they threw here.
 */
export const releaseRemovedSystems = (state: State): Thrown[] => {
    const errors: Thrown[] = [];
    const released = state.syncSystems.filter(runner => !state.added.includes(runner.syncSystem));
    if (released.length === 0) return errors;
    refreshSyncSystemIndexes(state);
    for (const runner of released) {
        const { syncSystem, remote } = runner;
        if (remote !== null) remote.channel.releaseRemovedSystem(remote.index);
        else if (syncSystem.kind === "removed") {
            errors.push(...runRemovedForEvery(state, runner));
            // Its commands apply at the next sync point.
            if (runner.target.buffer.count > 0) state.queued.push({ buffer: runner.target.buffer, guarded: true });
        }
        state.activated.delete(syncSystem);
        state.unplacedSeen.delete(syncSystem);
        runner.indexes.release();
    }
    state.syncSystems.splice(0, state.syncSystems.length, ...state.syncSystems.filter(runner => !released.includes(runner)));
    return errors;
};
