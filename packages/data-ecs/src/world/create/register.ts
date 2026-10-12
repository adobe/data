import type { Leaf } from '../../system/leaf.js';
import type { Name } from '../../system/name.js';
import type { System } from '../../system/system.js';
import { createRunner, type Runner } from './runner.js';
import { checkLeaf, createSchedule, isLeaf, type Schedule } from './schedule.js';
import { idOf, type Key, type State } from './state.js';

/** What a registration still has to do asynchronously: add resources, then load kernels; `rollback` undoes it if that fails. */
/** `ticked`: components the new systems filter on, which must keep ticks before they run. */
export type Registration = { readonly resources: readonly Key[]; readonly ticked: readonly number[]; readonly kernels: readonly Runner[]; readonly rollback: () => void };

export type Registrar = {
    /** Validates and records systems and all their members. Throws without recording anything on failure. */
    readonly register: (systems: readonly System[]) => Registration;
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

export const createRegistrar = (state: State): Registrar => {
    const named = new Map<Name, System>();
    const schedules = new Map<System, Schedule>();
    const runners = new Map<Leaf, Runner>();
    const kernelIndexes = new Map<Runner, number>();
    /** The system that reduces into each resource: a resource holds one system's reduction. */
    const reducers = new Map<Key, Name>();
    /** Never reused, so a rolled-back kernel's index can't alias a worker's loaded kernel. */
    let nextKernel = 0;

    const register = (roots: readonly System[]): Registration => {
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
                if (existing !== undefined) throw new Error(`A different system named "${name}" is already registered.`);
                added.set(name, system);
                addedSchedules.set(system, createSchedule(system));
                if (isLeaf(system)) {
                    checkLeaf(system);
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
