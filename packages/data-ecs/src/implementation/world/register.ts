import { conditional, declarationOf } from '../../interface/registry/index.js';
import { kindOf } from '../../interface/registry/index.js';
import type { Leaf } from '../../interface/system/leaf.js';
import { requireDefinition, type Definition } from '../../interface/registry/index.js';
import { createRunner, type Runner } from './runner.js';
import { isLeaf, reducedBy, scheduleOf, type Schedule } from '../../interface/registry/schedule.js';
import { idOf, type Key, type State } from './state.js';
import { labelOf } from '../../interface/registry/index.js';

/** What a registration still has to do asynchronously: add resources, then load kernels; `rollback` undoes it if that fails. */
/** `ticked`: components the new systems filter on, which must keep ticks before they run. */
export type Registration = { readonly resources: readonly Key[]; readonly ticked: readonly number[]; readonly kernels: readonly Runner[]; readonly rollback: () => void };

export type Registrar = {
    /** Validates and records a system with all its members. Throws without recording anything on failure. */
    readonly register: (system: Definition) => Registration;
    /** A registered system's schedule. */
    readonly registered: (system: Definition) => Schedule | undefined;
    readonly runnerOf: (leaf: Leaf) => Runner;
    /** A kernel runner's index, as workers know it. */
    readonly kernelIndexOf: (runner: Runner) => number;
    /** Every registered kernel runner. */
    readonly kernels: () => readonly Runner[];
    /** Rebuilds the runners of `kernel: "gpu"` systems for the world's current device, or for the CPU without one; returns them to load. */
    readonly placeGpuKernels: () => readonly Runner[];
};

/** Every system in a tree, the root included. */
const systemsOf = (root: Definition): Definition[] => {
    const all = new Set<Definition>();
    const visit = (system: Definition): void => {
        if (all.has(system)) return;
        all.add(system);
        if (!isLeaf(system)) for (const member of system.declaration.systems) visit(requireDefinition(member));
    };
    visit(root);
    return [...all];
};

/** Every component and resource a leaf names, so missing schemas throw at registration. */
const keysOf = (leaf: Leaf): { readonly components: readonly Key[]; readonly resources: readonly Key[] } => {
    const { components: access, lookup, resources } = leaf.declaration;
    const components = [...access?.read ?? [], ...access?.write ?? [], ...access?.has ?? [], ...access?.not ?? [], ...access?.added ?? [], ...access?.changed ?? []];
    for (const name in lookup) components.push(...lookup[name].read ?? [], ...lookup[name].has ?? [], ...lookup[name].not ?? []);
    const { up } = leaf.declaration;
    if (up !== undefined) components.push(up.through, ...up.read ?? []);
    return { components, resources: [...resources?.read ?? [], ...resources?.write ?? [], ...resources?.changed ?? [], ...resources?.is ?? [], ...resources?.not ?? [], ...reducedBy(leaf)] };
};

/** Throws if `up.through` isn't a registered reference component. */
const checkUp = (leaf: Leaf): void => {
    const { name, up } = leaf.declaration;
    if (up === undefined) return;
    if (kindOf(up.through) !== "component" || declarationOf(up.through)?.reference === undefined) {
        throw new Error(`System "${name}": up.through "${labelOf(up.through)}" isn't a reference component.`);
    }
};

/** For a filtered `up` leaf: its parent reference and what it reads of its parent, whose changes also pass a row. */
const upObserved = (leaf: Leaf): readonly Key[] => {
    const { components, resources, up } = leaf.declaration;
    const filtered = (components?.added?.length ?? 0) + (components?.changed?.length ?? 0) + (resources?.changed?.length ?? 0) > 0;
    return up === undefined || !filtered ? [] : [up.through, ...up.read ?? []];
};

/** The components a leaf needs ticks on: those it filters on, and those `upObserved` gives. */
const tickedBy = (leaf: Leaf): readonly Key[] =>
    [...leaf.declaration.components?.added ?? [], ...leaf.declaration.components?.changed ?? [], ...upObserved(leaf)];

/** The components whose `changed` stamps a leaf reads, so kernels writing them must keep their stamps. */
const observedBy = (leaf: Leaf): readonly Key[] => [...leaf.declaration.components?.changed ?? [], ...upObserved(leaf)];

/** Throws if a key is in both `read` and `write`: `write` already makes it readable. */
const checkLists = (kind: string, name: string, what: string, lists: { readonly read?: readonly Key[]; readonly write?: readonly Key[] } | undefined): void => {
    const writes = new Set(lists?.write);
    const both = (lists?.read ?? []).find(key => writes.has(key));
    if (both !== undefined) throw new Error(`${kind} "${name}" lists "${labelOf(both)}" in both ${what} read and write; write already makes it readable.`);
};

/**
 * Throws if a system reduces into a resource with an operator its `reduce` trait doesn't declare, or writes a resource
 * that's reduced, which only its contributors' fold sets.
 */
const checkReductions = (leaf: Leaf): void => {
    const { name, reduce, resources } = leaf.declaration;
    for (const key of reducedBy(leaf)) {
        const declared = declarationOf(key)?.reduce;
        const operator: unknown = Reflect.get(reduce ?? {}, key);
        if (declared === undefined) throw new Error(`System "${name}" reduces "${labelOf(key)}", which has no reduce trait.`);
        if (declared !== operator) throw new Error(`System "${name}" reduces "${labelOf(key)}" with "${labelOf(operator)}", but it's declared reduce: "${labelOf(declared)}".`);
    }
    for (const key of resources?.write ?? []) {
        if (declarationOf(key)?.reduce !== undefined) throw new Error(`System "${name}" writes "${labelOf(key)}", which is reduced; only its contributors' fold sets it.`);
    }
};

/**
 * Throws if a condition isn't a resource whose value can be `null` or `false`, is in both `is` and `not`, or is also
 * read or written: `is` already makes it readable.
 */
const checkConditions = (leaf: Leaf): void => {
    const { name, resources } = leaf.declaration;
    const is = resources?.is ?? [];
    const not = resources?.not ?? [];
    const listed = new Set<Key>([...resources?.read ?? [], ...resources?.write ?? []]);
    for (const key of [...is, ...not]) {
        const declaration = declarationOf(key);
        if (kindOf(key) !== "resource" || declaration === undefined) throw new Error(`System "${name}" runs on the condition of "${labelOf(key)}", which isn't a registered resource.`);
        const { type } = declaration;
        if (type !== undefined && !conditional(type)) throw new Error(`System "${name}" runs on the condition of "${labelOf(key)}", which is never null or false.`);
    }
    for (const key of is) {
        if (not.includes(key)) throw new Error(`System "${name}" lists "${labelOf(key)}" in both resources is and not.`);
        if (listed.has(key)) throw new Error(`System "${name}" lists "${labelOf(key)}" in resources is and in read or write; is already makes it readable.`);
    }
};

export const createRegistrar = (state: State): Registrar => {
    const schedules = new Map<Definition, Schedule>();
    const runners = new Map<Leaf, Runner>();
    const kernelIndexes = new Map<Runner, number>();
    /** Never reused, so a rolled-back kernel's index can't alias a worker's loaded kernel. */
    let nextKernel = 0;

    const register = (root: Definition): Registration => {
        const addedSchedules = new Map<Definition, Schedule>();
        const addedRunners = new Map<Leaf, Runner>();
        const resources = new Set<Key>();
        for (const system of systemsOf(root)) {
            if (schedules.has(system)) continue;
            const { name } = system.declaration;
            addedSchedules.set(system, scheduleOf(system));
            if (isLeaf(system)) {
                checkLists("System", name, "components", system.declaration.components);
                checkLists("System", name, "resources", system.declaration.resources);
                for (const key of system.declaration.components?.write ?? []) {
                    if (declarationOf(key)?.reference !== undefined) throw new Error(`System "${name}" writes "${labelOf(key)}", a reference, which changes only through commands.`);
                }
                checkReductions(system);
                checkConditions(system);
                checkUp(system);
                const keys = keysOf(system);
                for (const key of keys.components) idOf(state, key);
                for (const key of keys.resources) {
                    idOf(state, key);
                    resources.add(key);
                }
                addedRunners.set(system, createRunner(state, system));
            }
        }
        for (const [system, schedule] of addedSchedules) schedules.set(system, schedule);
        for (const [leaf, runner] of addedRunners) {
            runners.set(leaf, runner);
            if (runner.afterSync !== null) state.afterSync.add(runner.afterSync);
            if (runner.kernel !== null) kernelIndexes.set(runner, nextKernel++);
        }
        // New `changed` filters observe more components, so kernels that muted their stamps must load again.
        const observedBefore = new Set(state.observed);
        for (const leaf of addedRunners.keys()) for (const key of observedBy(leaf)) state.observed.add(idOf(state, key));
        const kernels = [...kernelIndexes.keys()].filter(runner => runner.kernel?.stale() === true);
        const rollback = (): void => {
            for (const system of addedSchedules.keys()) schedules.delete(system);
            for (const leaf of addedRunners.keys()) runners.delete(leaf);
            for (const runner of addedRunners.values()) if (runner.afterSync !== null) state.afterSync.delete(runner.afterSync);
            for (const runner of addedRunners.values()) kernelIndexes.delete(runner);
            state.observed.clear();
            for (const id of observedBefore) state.observed.add(id);
        };
        const ticked = [...addedRunners.keys()].flatMap(leaf => tickedBy(leaf).map(key => idOf(state, key)));
        return { resources: [...resources], ticked, kernels, rollback };
    };

    const registered = (system: Definition): Schedule | undefined => schedules.get(system);

    const runnerOf = (leaf: Leaf): Runner => {
        const runner = runners.get(leaf);
        if (runner === undefined) throw new Error(`System "${leaf.declaration.name}" isn't registered.`);
        return runner;
    };

    const placeGpuKernels = (): readonly Runner[] => {
        const placed: Runner[] = [];
        for (const [leaf, old] of runners) {
            if (leaf.declaration.kernel !== "gpu") continue;
            const runner = createRunner(state, leaf);
            runners.set(leaf, runner);
            if (old.afterSync !== null) state.afterSync.delete(old.afterSync);
            if (runner.afterSync !== null) state.afterSync.add(runner.afterSync);
            kernelIndexes.delete(old);
            if (runner.kernel !== null) kernelIndexes.set(runner, nextKernel++);
            placed.push(runner);
        }
        return placed;
    };

    return { register, registered, runnerOf, kernelIndexOf: runner => kernelIndexes.get(runner) ?? -1, kernels: () => [...kernelIndexes.keys()], placeGpuKernels };
};
