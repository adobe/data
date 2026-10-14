import type { Finalizer } from '../../finalizer/finalizer.js';
import type { Rule } from '../../rule/rule.js';
import type { RuleFacts } from './closure.js';
import { createFinalizerRunner, type FinalizerRunner } from './finalizers.js';
import { programFinalizers, programRules, programVersion, triggersOf } from './program.js';
import { ensureResources, findResource } from './resources.js';
import { idOf, type Key, type State } from './state.js';
import { restratify } from './structure.js';

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
    return keys.length === 0 || (any ? keys.some(key => state.ids.has(key)) : keys.every(key => state.ids.has(key)));
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
            const { name, components, derive } = rule.declaration;
            const ids = (keys: readonly Key[]): number[] => keys.map(key => idOf(state, key));
            facts.push({ name, has: ids(components.has ?? []), not: ids(components.not ?? []), derives: ids(derive) });
        }
        for (const finalizer of programFinalizers()) {
            // A finalizer added during a run waits for its resources, which are added between runs.
            if (activated.has(finalizer) || !ready(state, finalizer) || resourcesOf(finalizer).some(key => findResource(state, key) === undefined)) continue;
            activated.add(finalizer);
            runners.set(finalizer, createFinalizerRunner(state, finalizer));
        }
    }
    if (facts.length > 0) {
        restratify(structure, [...structure.rules, ...facts], structure.hosts, id => String(state.keys[id]));
        // Entities may already match a rule added to the program after the world met its components.
        structure.rederive = true;
    }
    if (runners.size > 0) {
        const existing = new Map(state.finalizers.map(runner => [runner.finalizer, runner]));
        const ordered = programFinalizers().flatMap(finalizer => runners.get(finalizer) ?? existing.get(finalizer) ?? []);
        state.finalizers.splice(0, state.finalizers.length, ...ordered);
    }
};
