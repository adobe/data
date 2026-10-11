import type { Commands } from '../../system/commands.js';
import type { Leaf } from '../../system/leaf.js';
import type { Name } from '../../system/name.js';
import type { System } from '../../system/system.js';
import { createRunner, type Runner } from './runner.js';
import { checkLeaf, createSchedule, isLeaf, type Schedule } from './schedule.js';
import { idOf, type Key, type State } from './state.js';

export type Registrar = {
    /** Validates and records systems and all their members. Returns the resources they use. Throws without recording anything on failure. */
    readonly register: (systems: readonly System[]) => readonly Key[];
    /** Throws if the system isn't registered. */
    readonly scheduleOf: (system: System) => Schedule;
    readonly runnerOf: (leaf: Leaf) => Runner;
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
    return { components, resources: [...resources?.read ?? [], ...resources?.write ?? [], ...resources?.changed ?? []] };
};

export const createRegistrar = (state: State, commands: Commands): Registrar => {
    const named = new Map<Name, System>();
    const schedules = new Map<System, Schedule>();
    const runners = new Map<Leaf, Runner>();

    const register = (roots: readonly System[]): readonly Key[] => {
        const added = new Map<Name, System>();
        const addedSchedules = new Map<System, Schedule>();
        const addedRunners = new Map<Leaf, Runner>();
        const resources = new Set<Key>();
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
                    const keys = keysOf(system);
                    for (const key of keys.components) idOf(state, key);
                    for (const key of keys.resources) {
                        idOf(state, key);
                        resources.add(key);
                    }
                    addedRunners.set(system, createRunner(state, system, commands));
                }
            }
        }
        for (const [name, system] of added) named.set(name, system);
        for (const [system, schedule] of addedSchedules) schedules.set(system, schedule);
        for (const [leaf, runner] of addedRunners) runners.set(leaf, runner);
        return [...resources];
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

    return { register, scheduleOf, runnerOf, get: name => named.get(name) ?? null };
};
