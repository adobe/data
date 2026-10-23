// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../../interface/component/component.js';
import type { Entity } from '../../interface/entity/entity.js';
import type { Finalizer } from '../../interface/finalizer/created.js';
import type { ChangeSet } from '../../interface/finalizer/body.js';
import type { Commands } from '../../interface/system/commands.js';
import type { Archetype } from './archetype.js';
import { createBuffer, valueAt, type CommandBuffer } from './buffer.js';
import { readCell } from './cells.js';
import { createCommands } from './commands.js';
import { asEntity, indexOf, locate } from './entities.js';
import { createContext, rowBinder, type Context } from './rows.js';
import { idOf, type Key, type State } from './state.js';
import type { Queued } from './synchronize.js';
import type { Essential, ReadonlyValue } from '../../interface/component/value.js';
import type { Leaf } from '../../interface/finalizer/created.js';
import { newestKeyOf, threadOf } from '../../interface/registry/index.js';
import type { Layout } from '../../interface/registry/layout.js';
import type { TaskChannel } from './remote-systems.js';
import { resourceOffsetsOf, writeStops, type StopsOf } from './stop-lists.js';
import { acquireLookups, refreshUses, type IndexLookups } from './indexes.js';
import { indexWatchesOf } from './lookup-keys.js';

/** A registered finalizer, resolved for a world: what it matches or watches, its context, and the buffer its commands go to. */
export type FinalizerRunner = {
    readonly finalizer: Finalizer;
    readonly required: readonly number[];
    readonly excluded: readonly number[];
    /** For a changes finalizer: whether it watches a component, by id. */
    readonly watches: (id: number) => boolean;
    /** By archetype id: 1 if it matches, 2 if not, 0 until known. */
    readonly matches: number[];
    readonly context: Context;
    /** A new buffer each sync point it issues commands in, since the last one is queued for the next. */
    readonly target: { buffer: CommandBuffer };
    readonly commands: Commands;
    readonly reads: readonly Key[];
    /** The indexes its lookups go through, held for the world's life. */
    readonly indexes: IndexLookups;
    /** Where a joined thread fills its thread: its stops go to that thread's stop lists, and it runs there. */
    remote: RemoteFinalizer | null;
};

/** Before a sync point's finalizers run, or every live match's once the world is disposed: refreshes the indexes they look up through. */
export const refreshFinalizerIndexes = (state: State): void => {
    for (const runner of state.finalizers) if (runner.remote === null && runner.indexes.uses.length > 0) refreshUses(state, runner.indexes.uses);
};

/** A finalizer placed on a joined thread: its channel, and what its stop lists hold. */
export type RemoteFinalizer = StopsOf & { readonly channel: TaskChannel };

export const isFinalizer = (value: { readonly kind: string }): value is Finalizer => value.kind === "finalizer" || value.kind === "changes";

export const createFinalizerRunner = (state: State, finalizer: Finalizer): FinalizerRunner => {
    const { declaration } = finalizer;
    const query = finalizer.kind === "finalizer" ? finalizer.declaration.components : undefined;
    const reads = query?.read ?? [];
    // By default every component that isn't derived, including ones a world first meets later; never resources, nor
    // the objects a joined thread fills, whose storage here holds only tags.
    let watches = (id: number): boolean => !state.derived[id] && !state.resources.has(id) && state.remote[id] === undefined;
    const watch = finalizer.kind === "changes" ? finalizer.declaration.watch : undefined;
    if (watch !== undefined) {
        // `Finalizer.changes` rejected derived components.
        const watched = new Set(watch.map(key => idOf(state, key)));
        watches = id => watched.has(id);
    }
    const target = { buffer: createBuffer() };
    const commands = createCommands(state, target);
    // One on another thread than the world's runs there after the sync point, so it issues none, wherever it runs.
    const thread = finalizer.kind === "finalizer" ? threadOf(finalizer.declaration, "Finalizer", finalizer.name) : null;
    const commanding = thread === null || thread === "world";
    const indexes = acquireLookups(state, declaration.lookup);
    // Followed for the world's life, as finalizers are; their ticks start before the next run.
    for (const key of indexWatchesOf(declaration.lookup)) state.watchesPending.push(idOf(state, key));
    return {
        finalizer,
        required: [...new Set([...reads, ...query?.has ?? []])].map(key => idOf(state, key)),
        excluded: (query?.not ?? []).map(key => idOf(state, key)),
        watches,
        matches: [],
        context: createContext(state, declaration, commanding ? { commands, indexes: indexes.byName } : { indexes: indexes.byName }),
        target,
        commands,
        reads,
        indexes,
        remote: null,
    };
};

/**
 * Places a finalizer on a joined thread's channel, posting it there, or back on the world's thread with null. Its reads
 * are listed as the thread reads them: objects by their tags, linear structs by their bytes, strings by handles of
 * copies of their records. Throws if the thread can't name it.
 */
export const placeFinalizer = (state: State, runner: FinalizerRunner, channel: TaskChannel | null): void => {
    const { finalizer } = runner;
    if (channel === null || finalizer.kind !== "finalizer") {
        runner.remote = null;
        return;
    }
    const objects: number[] = [];
    const linear: number[] = [];
    const strides: number[] = [];
    const copies: boolean[] = [];
    for (const key of runner.reads) {
        const id = idOf(state, key);
        const layout = state.layouts[id];
        if (layout.kind === "object") objects.push(id);
        // A string's stops hold copies of its records, which the thread may read past their entity's sync point.
        else if (layout.kind === "linear" || layout.kind === "string") {
            linear.push(id);
            strides.push(layout.stride);
            copies.push(layout.kind === "string");
        }
    }
    // Its string and linear resources, in the order the thread's context reads them, copied as of before apply.
    const stringResources: number[] = [];
    const linearResources: number[] = [];
    const resourceStrides: number[] = [];
    const stringStarts: unknown[] = [];
    const linearStarts: unknown[] = [];
    const resourceLayouts: Layout[] = [];
    for (const key of new Set<Key>(finalizer.declaration.resources?.read ?? [])) {
        const id = idOf(state, key);
        const layout = state.layouts[id];
        if (layout.kind === "string") {
            stringResources.push(id);
            stringStarts.push(state.starts[id]);
        }
        else if (layout.kind === "linear") {
            linearResources.push(id);
            resourceStrides.push(layout.stride);
            linearStarts.push(state.starts[id]);
            resourceLayouts.push(layout);
        }
    }
    const resourceOffsets = resourceOffsetsOf(stringResources.length, resourceStrides);
    const index = channel.placeFinalizer(state, finalizer);
    runner.remote = { finalizer, index, objects, linear, strides, copies, stringResources, linearResources, resourceStrides, resourceOffsets, stringStarts, linearStarts, resourceLayouts, entries: [], channel };
};

const matches = (runner: FinalizerRunner, archetype: Archetype): boolean => {
    let known = runner.matches[archetype.id] ?? 0;
    if (known === 0) {
        const { storageById } = archetype;
        known = !archetype.resource && !(archetype.meta && runner.required.length === 0) && runner.required.every(id => storageById[id] !== undefined) && runner.excluded.every(id => storageById[id] === undefined) ? 1 : 2;
        runner.matches[archetype.id] = known;
    }
    return known === 1;
};

/** Whether the entity at `entry` was alive before this sync point: neither spawned by a command nor committed from a batch here. */
const fromOf = (state: State, entry: number): Archetype | null => {
    const { plan } = state;
    const from = plan.from[entry];
    if (from < 0) return null;
    const first = state.born?.get(from);
    return first !== undefined && state.entities.row[indexOf(plan.entity[entry])] >= first ? null : state.archetypes[from];
};

type Untyped = { body(row: object, context: object): void };

/** What a finalizer threw, kept for after the sync point applies; `"thread"` for one whose thread is gone. */
export type Thrown = { readonly finalizer: Finalizer; readonly error: unknown; readonly kind?: "thread" };

/** Calls `body`, keeping what it throws. */
const guarded = (errors: Thrown[], finalizer: Finalizer, body: () => void): void => {
    try { body(); }
    catch (error) { errors.push({ finalizer, error }); }
};

/** Whether the entity at `entry` stops matching: it matched before, and is despawned, no longer matches, or had a required component replaced. */
const stops = (state: State, runner: FinalizerRunner, entry: number): Archetype | null => {
    const { plan, archetypes } = state;
    const fromId = plan.from[entry];
    if (fromId < 0) return null;
    const from = archetypes[fromId];
    if (!matches(runner, from)) return null;
    const { born } = state;
    if (born !== null && born.size > 0) {
        // Committed from a batch here, so it wasn't alive before.
        const first = born.get(fromId);
        if (first !== undefined && state.entities.row[indexOf(plan.entity[entry])] >= first) return null;
    }
    if (plan.despawned[entry] === 1 || !matches(runner, archetypes[plan.to[entry]])) return from;
    return plan.fresh.size > 0 && (plan.fresh.get(entry)?.some(id => runner.required.includes(id)) ?? false) ? from : null;
};

/** A finalizer a joined thread runs: its stops, staged for the thread's stop list. */
const stageStops = (state: State, runner: FinalizerRunner, remote: RemoteFinalizer): void => {
    for (let entry = 0; entry < state.plan.count; entry++) if (stops(state, runner, entry) !== null) remote.entries.push(entry);
    if (remote.entries.length > 0) remote.channel.stops.staged.push(remote);
};

/** Each entity that stops matching, its body run against its row before apply. */
const finalizeStops = (state: State, runner: FinalizerRunner, leaf: Leaf, errors: Thrown[]): void => {
    // Rows and contexts are built to each finalizer's declaration, so its body accepts them.
    const finalizer: Untyped = leaf;
    const { plan, entities } = state;
    const byArchetype = new Map<Archetype, number[]>();
    for (let entry = 0; entry < plan.count; entry++) {
        const from = stops(state, runner, entry);
        if (from === null) continue;
        let entries = byArchetype.get(from);
        if (entries === undefined) byArchetype.set(from, entries = []);
        entries.push(entry);
    }
    const bind = rowBinder(state, runner.reads, []);
    for (const [archetype, stopped] of byArchetype) {
        const row = bind(archetype);
        for (const entry of stopped) {
            row.index = entities.row[indexOf(plan.entity[entry])];
            guarded(errors, leaf, () => finalizer.body(row.value, runner.context.value));
        }
    }
};

const missing = Symbol("missing");

/** The last value commands give `id` within an entry's ranges, in issue order, or `missing`. */
export const commandValue = (state: State, queued: readonly Queued[], entry: number, id: number): unknown => {
    const { plan } = state;
    if (plan.start[entry] < 0) return missing;
    const last = (buffer: number, start: number, end: number, found: unknown): unknown => {
        const commands = queued[buffer].buffer;
        const { ids } = commands;
        let at = -1;
        for (let k = start; k < end; k++) if (ids[k] === id) at = k;
        return at < 0 ? found : valueAt(commands, at, state.layouts);
    };
    let value = last(plan.buffer[entry], plan.start[entry], plan.end[entry], missing);
    const more = plan.more.size === 0 ? undefined : plan.more.get(entry);
    if (more !== undefined) for (let r = 0; r < more.length; r += 3) value = last(more[r], more[r + 1], more[r + 2], value);
    return value;
};

export const isMissing = (value: unknown): boolean => value === missing;

/** A watched component's newest key: watched components are registered and not derived, so they're essential. */
const essential = (state: State, id: number): Essential => newestKeyOf(state.keys[id]) as Essential;

/** A group of a change set, as it's built. */
type Grouped = { from: Essential[] | null; to: Essential[] | null; added: Essential[]; removed: Essential[]; replaced: Essential[]; entities: Entity[] };

/** No components, shared by every group that replaces none. */
const none: readonly number[] = [];

/** The sync point's structural changes to a changes finalizer's components, grouped by how they changed. */
const changesOf = (state: State, runner: FinalizerRunner, queued: readonly Queued[]): ChangeSet<Essential> => {
    const { plan, archetypes, entities } = state;
    const { watches } = runner;
    const names = (archetype: Archetype | null): Essential[] | null =>
        archetype === null ? null : archetype.components.filter(watches).map(id => essential(state, id));
    const groups = new Map<string, Grouped>();
    /** By `from` and `to` archetype ids: the watched components on each side, and those added and removed. */
    const pairs = new Map<number, { readonly before: Essential[] | null; readonly after: Essential[] | null; readonly added: Essential[]; readonly removed: Essential[] }>();
    const pairOf = (from: Archetype | null, to: Archetype | null) => {
        const key = ((from?.id ?? -1) + 1) * 0x200000 + (to?.id ?? -1) + 1;
        let pair = pairs.get(key);
        if (pair === undefined) {
            const before = names(from);
            const after = names(to);
            pair = { before, after, added: (after ?? []).filter(name => !(before ?? []).includes(name)), removed: (before ?? []).filter(name => !(after ?? []).includes(name)) };
            pairs.set(key, pair);
        }
        return pair;
    };
    /** The watched components an entry's adds give a value that it has before and after, in id order, removed meanwhile or not. */
    const scratch: number[] = [];
    const scan = (from: Archetype, to: Archetype, buffer: number, start: number, end: number): void => {
        const { ids } = queued[buffer].buffer;
        for (let k = start; k < end; k++) {
            const id = ids[k];
            if (from.storageById[id] !== undefined && to.storageById[id] !== undefined && watches(id) && !scratch.includes(id)) scratch.push(id);
        }
    };
    const replacedOf = (entry: number, from: Archetype | null, to: Archetype | null): readonly number[] => {
        if (entry < 0 || from === null || to === null || plan.start[entry] < 0) return none;
        scratch.length = 0;
        scan(from, to, plan.buffer[entry], plan.start[entry], plan.end[entry]);
        const more = plan.more.size === 0 ? undefined : plan.more.get(entry);
        if (more !== undefined) for (let r = 0; r < more.length; r += 3) scan(from, to, more[r], more[r + 1], more[r + 2]);
        return scratch.length === 0 ? none : scratch.slice().sort((a, b) => a - b);
    };
    /**
     * The last entry's archetypes, the components its one range of values names, none without one, and its group, null
     * for no change: consecutive entries, as one system's commands over one archetype make, usually share all three.
     */
    let lastFrom: Archetype | null | undefined;
    let lastTo: Archetype | null | undefined;
    const lastIds: number[] = [];
    let lastGroup: Grouped | null = null;
    /** Whether an entry's one range of values, or none, names the components the last one's did. */
    const sameIds = (entry: number): boolean => {
        const start = entry < 0 ? -1 : plan.start[entry];
        if (start < 0) return lastIds.length === 0;
        const { ids } = queued[plan.buffer[entry]].buffer;
        const length = plan.end[entry] - start;
        if (length !== lastIds.length) return false;
        for (let i = 0; i < length; i++) if (ids[start + i] !== lastIds[i]) return false;
        return true;
    };
    const add = (entity: number, from: Archetype | null, to: Archetype | null, entry: number): void => {
        // The resource entity's components are resources, not changes, and reports are the world's own.
        if (from?.resource === true || to?.resource === true || from?.meta === true || to?.meta === true) return;
        const single = entry < 0 || plan.more.size === 0 || !plan.more.has(entry);
        if (single && from === lastFrom && to === lastTo && sameIds(entry)) {
            lastGroup?.entities.push(asEntity(entity));
            return;
        }
        const replaced = replacedOf(entry, from, to);
        const { before, after, added, removed } = pairOf(from, to);
        let group: Grouped | null = null;
        if (replaced.length > 0 || added.length > 0 || removed.length > 0) {
            const key = `${from?.id ?? -1}:${to?.id ?? -1}:${replaced.join(",")}`;
            group = groups.get(key) ?? null;
            if (group === null) groups.set(key, group = { from: before, to: after, added, removed, replaced: replaced.map(id => essential(state, id)), entities: [] });
            group.entities.push(asEntity(entity));
        }
        lastFrom = undefined;
        if (!single) return;
        lastFrom = from;
        lastTo = to;
        lastGroup = group;
        lastIds.length = 0;
        const start = entry < 0 ? -1 : plan.start[entry];
        if (start < 0) return;
        const { ids } = queued[plan.buffer[entry]].buffer;
        for (let k = start; k < plan.end[entry]; k++) lastIds.push(ids[k]);
    };
    for (let entry = 0; entry < plan.count; entry++) {
        const from = fromOf(state, entry);
        const despawned = plan.despawned[entry] === 1;
        // Spawned and despawned within the sync point: never there before or after.
        if (from === null && despawned) continue;
        add(plan.entity[entry], from, despawned ? null : archetypes[plan.to[entry]], entry);
    }
    // Batch spawns no command touched, which have no entry.
    for (const [id, first] of state.born ?? []) {
        const archetype = archetypes[id];
        for (let row = first; row < archetype.count; row++) {
            const entity = archetype.entities[row];
            if ((plan.slots[indexOf(entity)] ?? -1) < 0) add(entity, null, archetype, -1);
        }
    }
    const live = (entity: Entity, id: number): unknown => {
        const index = locate(entities, entity);
        if (index < 0) return null;
        const storage = archetypes[entities.archetype[index]].storageById[id];
        return storage === undefined ? null : readCell(storage, entities.row[index]);
    };
    const bornHere = (entity: Entity): boolean => {
        const index = locate(entities, entity);
        if (index < 0) return true;
        const first = state.born?.get(entities.archetype[index]);
        return first !== undefined && entities.row[index] >= first;
    };
    const next = (entity: Entity, id: number): unknown => {
        const entry = plan.slots[indexOf(entity)] ?? -1;
        if (entry < 0 || plan.entity[entry] !== entity) return live(entity, id);
        if (plan.despawned[entry] === 1 || archetypes[plan.to[entry]].storageById[id] === undefined) return null;
        const value = commandValue(state, queued, entry, id);
        return isMissing(value) ? live(entity, id) : value;
    };
    return {
        groups: [...groups.values()],
        // Stored and commanded values match each component's registered schema, so they have its type.
        previous: <K extends Essential>(entity: Entity, key: K) => (bornHere(entity) ? null : live(entity, idOf(state, key))) as ReadonlyValue<K> | null,
        next: <K extends Essential>(entity: Entity, key: K) => next(entity, idOf(state, key)) as ReadonlyValue<K> | null,
    };
};

/** Whether a joined thread's finalizers have stops this sync point. */
const staged = (state: State): boolean => {
    for (let k = 0; k < state.channels.length; k++) if (state.channels[k].stops.staged.length > 0) return true;
    return false;
};

/**
 * Runs every finalizer against the planned sync point, before it applies, in their order, and writes the stop lists of
 * those joined threads run. Their commands queue for the next sync point. Returns the errors they threw, for after
 * the sync point applies.
 */
export const runFinalizers = (state: State, queued: readonly Queued[], born: Map<number, number>, tick: number): Thrown[] => {
    const errors: Thrown[] = [];
    state.born = born;
    try {
        for (const runner of state.finalizers) {
            const { finalizer, remote } = runner;
            if (remote !== null) {
                stageStops(state, runner, remote);
                continue;
            }
            runner.context.bind();
            if (finalizer.kind === "finalizer") finalizeStops(state, runner, finalizer, errors);
            else {
                // The context is built to the finalizer's declaration, so its body accepts it.
                const changes: { body(changes: ChangeSet<Essential>, context: object): void } = finalizer;
                guarded(errors, finalizer, () => changes.body(changesOf(state, runner, queued), runner.context.value));
            }
            if (runner.target.buffer.count > 0) {
                state.queued.push({ buffer: runner.target.buffer, guarded: true });
                runner.target.buffer = createBuffer();
            }
        }
        if (state.claimed && staged(state)) {
            const { plan } = state;
            const resource = state.resourceEntity < 0 ? -1 : indexOf(state.resourceEntity);
            const source = {
                entity: plan.entity, from: plan.from, despawned: plan.despawned, archetypes: state.archetypes, row: state.entities.row, holds: state.holds,
                resourceArchetype: resource < 0 ? -1 : state.entities.archetype[resource], resourceRow: resource < 0 ? 0 : state.entities.row[resource],
            };
            for (const channel of state.channels) writeStops(channel.stops, tick, source);
        }
    }
    finally {
        state.born = null;
        // Left clean after a throw too, for the next sync point.
        for (const channel of state.channels) {
            for (const stops of channel.stops.staged) stops.entries.length = 0;
            channel.stops.staged.length = 0;
        }
    }
    return errors;
};

/** At disposal: every per-query finalizer runs for every live entity it matches, so the handles they release are. */
export const finalizeAll = (state: State): Thrown[] => {
    const errors: Thrown[] = [];
    for (const runner of state.finalizers) {
        const { finalizer: leaf } = runner;
        // A joined thread finalizes its own, once it hears the world is disposed.
        if (leaf.kind !== "finalizer" || runner.remote !== null) continue;
        const finalizer: Untyped = leaf;
        runner.context.bind();
        const bind = rowBinder(state, runner.reads, []);
        for (const archetype of state.archetypes) {
            if (archetype.count === 0 || !matches(runner, archetype)) continue;
            const row = bind(archetype);
            for (let index = 0; index < archetype.count; index++) {
                row.index = index;
                guarded(errors, leaf, () => finalizer.body(row.value, runner.context.value));
            }
        }
    }
    return errors;
};
