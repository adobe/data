import type { Finalizer } from '../../finalizer/finalizer.js';
import { declarationOf } from '../../registry/create-registry.js';
import type { Rule } from '../../rule/rule.js';
import type { Leaf } from '../../system/leaf.js';
import type { Name } from '../../system/name.js';
import type { System } from '../../system/system.js';
import { createRunner, type Runner } from './runner.js';
import { checkLeaf, createSchedule, isLeaf, type Schedule } from './schedule.js';
import type { RuleFacts } from './closure.js';
import { createFinalizerRunner, isFinalizer, orderFinalizers, type FinalizerRunner } from './finalizers.js';
import { idOf, type Key, type State } from './state.js';
import { restratify } from './structure.js';

/** What a registration still has to do asynchronously: add resources, then load kernels; `rollback` undoes it if that fails. */
/** `ticked`: components the new systems filter on, which must keep ticks before they run. */
export type Registration = { readonly resources: readonly Key[]; readonly ticked: readonly number[]; readonly kernels: readonly Runner[]; readonly rollback: () => void };

export type Registrar = {
    /** Validates and records systems with all their members, rules and finalizers. Throws without recording anything on failure. */
    readonly register: (items: readonly (System | Rule | Finalizer)[]) => Registration;
    /** Throws if the system isn't registered. */
    readonly scheduleOf: (system: System) => Schedule;
    readonly runnerOf: (leaf: Leaf) => Runner;
    /** A kernel runner's index, as workers know it. */
    readonly kernelIndexOf: (runner: Runner) => number;
    /** Every registered kernel runner. */
    readonly kernels: () => readonly Runner[];
    readonly get: (name: Name) => System | null;
};

/** Every system in a tree, the root included. */
const systemsOf = (root: System): System[] => {
    const all = new Set<System>();
    const visit = (system: System): void => {
        if (all.has(system)) return;
        all.add(system);
        if (!isLeaf(system)) for (const member of system.declaration.systems) visit(member);
    };
    visit(root);
    return [...all];
};

/** Every component and resource a leaf names, so missing schemas throw at registration. */
const keysOf = (leaf: Leaf): { readonly components: readonly Key[]; readonly resources: readonly Key[] } => {
    const { query, lookup, resources } = leaf.declaration;
    const components = [...query?.read ?? [], ...query?.write ?? [], ...query?.has ?? [], ...query?.not ?? [], ...query?.added ?? [], ...query?.changed ?? []];
    for (const name in lookup) components.push(...lookup[name].read ?? [], ...lookup[name].has ?? [], ...lookup[name].not ?? []);
    return { components, resources: [...resources?.read ?? [], ...resources?.write ?? [], ...resources?.changed ?? [], ...reducedBy(leaf)] };
};

/** The resources a system reduces into. */
const reducedBy = (leaf: Leaf): readonly Key[] => {
    const reduce = leaf.declaration.resources?.reduce;
    return reduce === undefined ? [] : Reflect.ownKeys(reduce).filter(key => Reflect.get(reduce, key) !== undefined);
};

const isRule = (item: System | Rule | Finalizer): item is Rule => "derives" in item.declaration;

/** A rule as component ids. Throws if it derives a component that isn't derived, or matches on a resource. */
const factsOf = (state: State, rule: Rule): RuleFacts => {
    const { name, query, derives } = rule.declaration;
    for (const key of derives) {
        if (declarationOf(key)?.derived !== true) throw new Error(`Rule "${name}" derives "${String(key)}", which isn't declared derived.`);
    }
    const ids = (keys: readonly Key[] | undefined): number[] => (keys ?? []).map(key => {
        const id = idOf(state, key);
        if (state.resources.has(id)) throw new Error(`Rule "${name}" matches on "${String(key)}", which is a resource.`);
        return id;
    });
    return { name, has: ids(query.has), not: ids(query.not), derives: ids(derives) };
};

export const createRegistrar = (state: State): Registrar => {
    const named = new Map<Name, System>();
    const schedules = new Map<System, Schedule>();
    const runners = new Map<Leaf, Runner>();
    const kernelIndexes = new Map<Runner, number>();
    /** The system that reduces into each resource: a resource holds one system's reduction. */
    const reducers = new Map<Key, Name>();
    /** Never reused, so a rolled-back kernel's index can't alias a worker's loaded kernel. */
    let nextKernel = 0;

    /** Every registered name, systems', rules' and finalizers' alike. */
    const names = new Map<string, System | Rule | Finalizer>();
    const claim = (added: Map<string, System | Rule | Finalizer>, item: System | Rule | Finalizer): boolean => {
        const { name } = item.declaration;
        const existing = names.get(name) ?? added.get(name);
        if (existing === item) return false;
        if (existing !== undefined) throw new Error(`A different system, rule or finalizer named "${name}" is already registered.`);
        added.set(name, item);
        return true;
    };

    const register = (items: readonly (System | Rule | Finalizer)[]): Registration => {
        const claimed = new Map<string, System | Rule | Finalizer>();
        const roots = items.filter((item): item is System => !isRule(item) && !isFinalizer(item));
        const rules = items.filter(isRule).filter(rule => claim(claimed, rule));
        const finalizers = items.filter(isFinalizer).filter(finalizer => claim(claimed, finalizer));
        const { structure } = state;
        const nameOf = (id: number): string => String(state.keys[id]);
        const facts = rules.map(rule => factsOf(state, rule));
        if (facts.length > 0) {
            restratify(structure, [...structure.rules, ...facts], structure.hosts, nameOf);
            structure.rederive = true;
        }
        let runners: FinalizerRunner[] = [];
        /** Undoes only this registration's rules and finalizers, so others recorded since stay. */
        const restore = (): void => {
            for (const name of claimed.keys()) names.delete(name);
            if (facts.length > 0) {
                restratify(structure, structure.rules.filter(rule => !facts.includes(rule)), structure.hosts, nameOf);
                // Entities may already have what these rules derived.
                structure.rederive = true;
            }
            const remaining = state.finalizers.filter(runner => !runners.includes(runner));
            state.finalizers.splice(0, state.finalizers.length, ...remaining);
        };
        const finalizerResources = new Set<Key>();
        if (finalizers.length > 0) {
            try {
                const created: FinalizerRunner[] = finalizers.map(finalizer => {
                    const { lookup, resources } = finalizer.declaration;
                    for (const name in lookup) for (const key of [...lookup[name].read ?? [], ...lookup[name].has ?? [], ...lookup[name].not ?? []]) idOf(state, key);
                    for (const key of [...resources?.read ?? [], ...resources?.write ?? []]) {
                        idOf(state, key);
                        finalizerResources.add(key);
                    }
                    return createFinalizerRunner(state, finalizer);
                });
                state.finalizers.splice(0, state.finalizers.length, ...orderFinalizers([...state.finalizers, ...created]));
                runners = created;
            }
            catch (error) {
                restore();
                throw error;
            }
        }
        let systems: Registration;
        try {
            systems = registerSystems(roots);
        }
        catch (error) {
            restore();
            throw error;
        }
        for (const [name, item] of claimed) names.set(name, item);
        return {
            ...systems,
            resources: [...new Set([...systems.resources, ...finalizerResources])],
            rollback: () => {
                systems.rollback();
                restore();
            },
        };
    };

    const registerSystems = (roots: readonly System[]): Registration => {
        const added = new Map<Name, System>();
        const addedSchedules = new Map<System, Schedule>();
        const addedRunners = new Map<Leaf, Runner>();
        const resources = new Set<Key>();
        const addedReducers = new Map<Key, Name>();
        for (const root of roots) {
            for (const system of systemsOf(root)) {
                const { name } = system.declaration;
                const existing = named.get(name) ?? added.get(name);
                if (existing === system) continue;
                if (existing !== undefined || names.has(name)) throw new Error(`A different system, rule or finalizer named "${name}" is already registered.`);
                added.set(name, system);
                addedSchedules.set(system, createSchedule(system));
                if (isLeaf(system)) {
                    checkLeaf(system);
                    for (const key of system.declaration.query?.write ?? []) {
                        if (declarationOf(key)?.reference !== undefined) throw new Error(`System "${name}" writes "${String(key)}", a reference, which changes only through commands.`);
                    }
                    for (const key of reducedBy(system)) {
                        const other = reducers.get(key) ?? addedReducers.get(key);
                        if (other !== undefined) throw new Error(`Systems "${other}" and "${name}" both reduce "${String(key)}"; a resource holds one system's reduction.`);
                        addedReducers.set(key, name);
                    }
                    const keys = keysOf(system);
                    for (const key of keys.components) idOf(state, key);
                    for (const key of keys.resources) {
                        idOf(state, key);
                        resources.add(key);
                    }
                    addedRunners.set(system, createRunner(state, system));
                }
            }
        }
        for (const [name, system] of added) named.set(name, system);
        for (const [key, name] of addedReducers) reducers.set(key, name);
        for (const [system, schedule] of addedSchedules) schedules.set(system, schedule);
        for (const [leaf, runner] of addedRunners) {
            runners.set(leaf, runner);
            if (runner.afterSync !== null) state.afterSync.add(runner.afterSync);
            if (runner.kernel !== null) kernelIndexes.set(runner, nextKernel++);
        }
        // New `changed` filters observe more components, so kernels that muted their stamps must load again.
        const observedBefore = new Set(state.observed);
        for (const leaf of addedRunners.keys()) for (const key of leaf.declaration.query?.changed ?? []) state.observed.add(idOf(state, key));
        const kernels = [...kernelIndexes.keys()].filter(runner => runner.kernel?.stale() === true);
        const rollback = (): void => {
            for (const name of added.keys()) named.delete(name);
            for (const key of addedReducers.keys()) reducers.delete(key);
            for (const system of addedSchedules.keys()) schedules.delete(system);
            for (const leaf of addedRunners.keys()) runners.delete(leaf);
            for (const runner of addedRunners.values()) if (runner.afterSync !== null) state.afterSync.delete(runner.afterSync);
            for (const runner of addedRunners.values()) kernelIndexes.delete(runner);
            state.observed.clear();
            for (const id of observedBefore) state.observed.add(id);
        };
        const ticked = [...addedRunners.keys()].flatMap(leaf => [...leaf.declaration.query?.added ?? [], ...leaf.declaration.query?.changed ?? []].map(key => idOf(state, key)));
        return { resources: [...resources], ticked, kernels, rollback };
    };

    const scheduleOf = (system: System): Schedule => {
        const schedule = schedules.get(system);
        if (schedule === undefined) throw new Error(`System "${system.declaration.name}" isn't registered.`);
        return schedule;
    };

    const runnerOf = (leaf: Leaf): Runner => {
        const runner = runners.get(leaf);
        if (runner === undefined) throw new Error(`System "${leaf.declaration.name}" isn't registered.`);
        return runner;
    };

    return { register, scheduleOf, runnerOf, kernelIndexOf: runner => kernelIndexes.get(runner) ?? -1, kernels: () => [...kernelIndexes.keys()], get: name => named.get(name) ?? null };
};
