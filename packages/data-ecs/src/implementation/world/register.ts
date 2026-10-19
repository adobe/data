import type { Leaf } from '../../interface/system/leaf.js';
import { idOfItem, idOfKey, labelOf, requireDefinition, threadOf, type Definition } from '../../interface/registry/index.js';
import { createRemoteRunner, unplaceable } from './remote-systems.js';
import { createRunner, releaseHoldings, type Holdings, type Runner } from './runner.js';
import { isLeaf, reducedBy, scheduleOf, type Schedule } from '../../interface/registry/schedule.js';
import { idOf, observe, unobserve, type Key, type State } from './state.js';
import { labelOfItem } from '../../interface/registry/index.js';

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
    /**
     * Why a joined thread that imported the systems of ids `imported` can't claim `threads`: a registered system on one
     * it didn't import, or one without an id, or naming a key without one, or one that can't run on a joined thread;
     * null when every one can run there.
     */
    readonly crossing: (threads: readonly string[], imported: ReadonlySet<string>) => string | null;
    /** Places each registered system again, as claims were made or released: on its joined thread, or here. */
    readonly place: () => void;
    /** For tests of what a world holds: how many schedules, runners and kernel indexes it keeps. */
    readonly sizes: () => { readonly schedules: number; readonly runners: number; readonly kernels: number };
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

/** Every key a leaf names, as `keysOf` gives them, flattened. */
const allKeysOf = (leaf: Leaf): readonly Key[] => {
    const { components, resources } = keysOf(leaf);
    return [...components, ...resources];
};

/** A runner for a leaf where it runs now: on the joined thread filling its thread, or here. */
const placedRunner = (state: State, leaf: Leaf, since = 0): Runner => {
    const thread = threadOf(leaf.declaration, "System", leaf.name);
    const channel = thread === null ? undefined : state.threadTasks.get(thread);
    return channel === undefined ? createRunner(state, leaf, since) : createRemoteRunner(state, leaf, channel, since);
};

/**
 * A registered leaf, which lives only as long as its system: its system held weakly, what its runner holds, and the
 * components whose changes it counts as watching.
 */
type Entry = { readonly leaf: WeakRef<Leaf>; holdings: Holdings; readonly observed: readonly number[]; released: boolean };

/** What the registrar keeps of a registered system until it's collected: a leaf's entry, and whether it's still registered. */
type Registered = { readonly entry: Entry | null; registered: boolean };

/**
 * What a world keeps of each system it registered lives as long as the system's value: schedules and runners by
 * system, held weakly, so a system nothing references any more is collected, and with it its runner, its command
 * buffers and its `lastRun`. What a runner holds beyond its JS values is released once its system is collected.
 */
export const createRegistrar = (state: State): Registrar => {
    const schedules = new WeakMap<Definition, Schedule>();
    const runners = new WeakMap<Leaf, Runner>();
    /** Every registered leaf, for what goes over every runner: rare, at placements, device changes and kernel loads. */
    const live = new Set<Entry>();
    let scheduleCount = 0;

    const release = (entry: Entry): void => {
        if (entry.released) return;
        entry.released = true;
        live.delete(entry);
        releaseHoldings(state, entry.holdings);
        for (const id of entry.observed) unobserve(state, id);
    };
    /**
     * Called once a registered system is collected, with its record: a leaf's entry, or null for a composite, and whether
     * it's still registered, as a rolled-back one isn't, so no unregister token is kept per registration.
     */
    const collected = new FinalizationRegistry<Registered>(record => {
        if (!record.registered) return;
        scheduleCount--;
        if (record.entry !== null) release(record.entry);
    });

    /** Each live leaf with its runner. */
    const eachRunner = (visit: (leaf: Leaf, runner: Runner, entry: Entry) => void): void => {
        for (const entry of live) {
            const leaf = entry.leaf.deref();
            const runner = leaf === undefined ? undefined : runners.get(leaf);
            if (leaf !== undefined && runner !== undefined) visit(leaf, runner, entry);
        }
    };

    /** Puts a new runner in an entry's place, releasing what the one it replaces held. */
    const replace = (leaf: Leaf, entry: Entry, old: Runner, runner: Runner): void => {
        runners.set(leaf, runner);
        state.runnersVersion++;
        releaseHoldings(state, old.holdings);
        entry.holdings = runner.holdings;
        if (runner.holdings.afterSync !== null) state.afterSync.add(runner.holdings.afterSync);
    };

    const register = (root: Definition): Registration => {
        const added: { readonly system: Definition; readonly schedule: Schedule; readonly record: Registered; readonly runner: Runner | null }[] = [];
        const resources = new Set<Key>();
        for (const system of systemsOf(root)) {
            if (schedules.has(system)) continue;
            const schedule = scheduleOf(system);
            if (!isLeaf(system)) {
                added.push({ system, schedule, record: { entry: null, registered: true }, runner: null });
                continue;
            }
            // Creating the system checked its declaration; registering it gives its keys ids in this world.
            const keys = keysOf(system);
            for (const key of keys.components) idOf(state, key);
            for (const key of keys.resources) {
                idOf(state, key);
                resources.add(key);
            }
            const runner = placedRunner(state, system);
            const entry: Entry = { leaf: new WeakRef(system), holdings: runner.holdings, observed: observedBy(system).map(key => idOf(state, key)), released: false };
            added.push({ system, schedule, record: { entry, registered: true }, runner });
        }
        let observing = false;
        const kernels: Runner[] = [];
        for (const { system, schedule, record, runner } of added) {
            schedules.set(system, schedule);
            scheduleCount++;
            collected.register(system, record);
            const { entry } = record;
            if (runner === null || entry === null || !isLeaf(system)) continue;
            runners.set(system, runner);
            live.add(entry);
            if (runner.holdings.afterSync !== null) state.afterSync.add(runner.holdings.afterSync);
            if (runner.kernel !== null) kernels.push(runner);
            for (const id of entry.observed) {
                if (!state.observed.has(id)) observing = true;
                observe(state, id);
            }
        }
        // New `changed` filters observe more components, so kernels that muted their stamps must load again.
        if (observing) eachRunner((_, runner) => { if (runner.kernel?.stale() === true && !kernels.includes(runner)) kernels.push(runner); });
        const rollback = (): void => {
            for (const { system, record, runner } of added) {
                schedules.delete(system);
                scheduleCount--;
                record.registered = false;
                const { entry } = record;
                if (runner === null || entry === null || !isLeaf(system)) continue;
                runners.delete(system);
                release(entry);
            }
        };
        const ticked = added.flatMap(({ system }) => isLeaf(system) ? tickedBy(system).map(key => idOf(state, key)) : []);
        return { resources: [...resources], ticked, kernels, rollback };
    };

    const registered = (system: Definition): Schedule | undefined => schedules.get(system);

    const runnerOf = (leaf: Leaf): Runner => {
        const runner = runners.get(leaf);
        if (runner === undefined) throw new Error(`System "${labelOfItem(leaf)}" isn't registered.`);
        return runner;
    };

    const kernels = (): readonly Runner[] => {
        const found: Runner[] = [];
        eachRunner((_, runner) => { if (runner.kernel !== null) found.push(runner); });
        return found;
    };

    const placeGpuKernels = (): readonly Runner[] => {
        const placed: Runner[] = [];
        eachRunner((leaf, old, entry) => {
            if (leaf.declaration.kernel !== "gpu") return;
            const runner = createRunner(state, leaf);
            replace(leaf, entry, old, runner);
            placed.push(runner);
        });
        return placed;
    };

    const crossing = (threads: readonly string[], imported: ReadonlySet<string>): string | null => {
        let problem: string | null = null;
        eachRunner(leaf => {
            if (problem !== null) return;
            const thread = threadOf(leaf.declaration, "System", leaf.name);
            if (thread === null || !threads.includes(thread)) return;
            const label = labelOfItem(leaf);
            const id = idOfItem(leaf);
            if (id === undefined) problem = `System "${label}" runs on thread "${thread}" and has no id, so a joined thread can't run it; the build gives top-level systems one.`;
            else if (!imported.has(id)) problem = `System "${label}" runs on thread "${thread}", which the joined thread claiming it never imported.`;
            else {
                const unnamed = allKeysOf(leaf).find(key => typeof key !== "symbol" || idOfKey(key) === undefined);
                problem = unnamed !== undefined
                    ? `System "${label}" runs on thread "${thread}" and names "${labelOf(unnamed)}", which has no id, so a joined thread can't name it; the build gives top-level keys one.`
                    : unplaceable(leaf, thread);
            }
        });
        return problem;
    };

    const place = (): void => {
        eachRunner((leaf, old, entry) => {
            const thread = threadOf(leaf.declaration, "System", leaf.name);
            const channel = thread === null ? undefined : state.threadTasks.get(thread);
            if (channel === undefined ? old.remote === null : old.remote?.channel === channel) return;
            replace(leaf, entry, old, placedRunner(state, leaf, old.lastRun()));
        });
        state.placement++;
    };

    const sizes = () => ({ schedules: scheduleCount, runners: live.size, kernels: state.kernelIndexes.size });

    return { register, registered, runnerOf, kernelIndexOf: runner => runner.kernel?.index ?? -1, kernels, placeGpuKernels, crossing, place, sizes };
};
