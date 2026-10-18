import type { Finalizer } from '../../interface/finalizer/created.js';
import type { Rule } from '../../interface/rule/created.js';
import type { RuleFacts } from '../../interface/registry/strata.js';
import { createFinalizerRunner, type FinalizerRunner } from './finalizers.js';
import { programFinalizers, programRules, programVersion } from '../../interface/registry/program.js';
import { triggersOf } from './program.js';
import { ensureResources, findResource } from './resources.js';
import { idOf, metIdOf, type Key, type State } from './state.js';
import { restratify } from './structure.js';
import { labelOf, threadOf } from '../../interface/registry/index.js';

/** Why a finalizer doesn't run: its thread is one a joined thread claims, where finalizers don't run yet. */
export const unplacedFinalizer = (name: string, thread: string): string =>
    `Finalizer "${name}" runs on thread "${thread}", which a joined thread fills; finalizers don't run on joined threads yet.`;

/** A program finalizer on one of `threads`, as the reason a joined thread can't claim them; null for none. */
export const finalizerOn = (threads: readonly string[]): string | null => {
    for (const finalizer of programFinalizers()) {
        const thread = threadOf(finalizer.declaration, "Finalizer", finalizer.name);
        if (thread !== null && threads.includes(thread)) return unplacedFinalizer(finalizer.name, thread);
    }
    return null;
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
            // One a joined thread would run doesn't activate while it's claimed; the sync point reports it once.
            const thread = state.claimed ? threadOf(finalizer.declaration, "Finalizer", finalizer.name) : null;
            if (thread !== null && state.claims.has(thread)) {
                if (!state.unplacedSeen.has(finalizer)) {
                    state.unplacedSeen.add(finalizer);
                    state.unplaced.push({ finalizer, error: new Error(unplacedFinalizer(finalizer.name, thread)) });
                }
                continue;
            }
            activated.add(finalizer);
            runners.set(finalizer, createFinalizerRunner(state, finalizer));
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
