// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Finalizer } from '../../interface/finalizer/created.js';
import type { Rule } from '../../interface/rule/created.js';
import type { RuleFacts } from '../../interface/registry/strata.js';
import { createFinalizerRunner, placeFinalizer, type FinalizerRunner } from './finalizers.js';
import { finalizerKeysOf, type TaskChannel } from './remote-systems.js';
import { programFinalizers, programRules, programVersion } from '../../interface/registry/program.js';
import { triggersOf } from './program.js';
import { ensureResources, findResource } from './resources.js';
import { idOf, metIdOf, type Key, type State } from './state.js';
import { restratify } from './structure.js';
import { idOfItem, idOfKey, labelOf, threadOf } from '../../interface/registry/index.js';

/**
 * Why a joined thread that imported the items of ids `imported` can't claim `threads`: a program finalizer on one that
 * it never imported, or that has no id or names a key without one, so it can't name it; null when none.
 */
export const finalizerCrossing = (threads: readonly string[], imported: ReadonlySet<string>): string | null => {
    for (const finalizer of programFinalizers()) {
        if (finalizer.kind !== "finalizer") continue;
        const thread = threadOf(finalizer.declaration, "Finalizer", finalizer.name);
        if (thread === null || !threads.includes(thread)) continue;
        const label = finalizer.name;
        const id = idOfItem(finalizer);
        if (id === undefined) return `Finalizer "${label}" runs on thread "${thread}" and has no id, so a joined thread can't run it; the build gives top-level finalizers one.`;
        if (!imported.has(id)) return `Finalizer "${label}" runs on thread "${thread}", which the joined thread claiming it never imported.`;
        const unnamed = finalizerKeysOf(finalizer).find(key => idOfKey(key) === undefined);
        if (unnamed !== undefined) return `Finalizer "${label}" runs on thread "${thread}" and names "${labelOf(unnamed)}", which has no id, so a joined thread can't name it; the build gives top-level keys one.`;
    }
    return null;
};

/** The channel of the joined thread a finalizer runs on, or null for the world's thread. */
const channelOf = (state: State, finalizer: Finalizer): TaskChannel | null => {
    if (!state.claimed || finalizer.kind !== "finalizer") return null;
    const thread = threadOf(finalizer.declaration, "Finalizer", finalizer.name);
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

const resourcesOf = (finalizer: Finalizer): readonly Key[] => [...finalizer.declaration.resources?.read ?? [], ...finalizer.declaration.resources?.write ?? []];

/** Between runs: adds the resources of every finalizer in the program, so one can activate at any sync point. */
export const ensureProgramResources = (state: State, ensured: { version: number }): void => {
    const version = programVersion();
    if (ensured.version === version) return;
    ensured.version = version;
    ensureResources(state, new Set(programFinalizers().flatMap(resourcesOf)));
    // Finalizers waiting for these can activate at the next sync point.
    state.activation.met = true;
};

const ready = (state: State, item: Rule | Finalizer): boolean => {
    const { keys, any } = triggersOf(item);
    return keys.length === 0 || (any ? keys.some(key => metIdOf(state, key) !== undefined) : keys.every(key => metIdOf(state, key) !== undefined));
};

/**
 * At the start of a sync point: activates the program's rules and finalizers that can match here now, so they apply
 * from this sync point on. Until the world has met each component one needs, nothing can match it. Activating
 * resolves its components' ids, which may make more ready.
 */
export const activate = (state: State): void => {
    const { activation, activated, structure } = state;
    if (!activation.met && activation.version === programVersion()) return;
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
        for (const finalizer of programFinalizers()) {
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
        const ordered = programFinalizers().flatMap(finalizer => runners.get(finalizer) ?? existing.get(finalizer) ?? []);
        state.finalizers.splice(0, state.finalizers.length, ...ordered);
    }
};
