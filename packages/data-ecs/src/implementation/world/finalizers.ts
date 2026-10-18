import type { Component } from '../../interface/component/component.js';
import type { Entity } from '../../interface/entity/entity.js';
import type { Finalizer } from '../../interface/finalizer/created.js';
import type { ChangeSet } from '../../interface/finalizer/body.js';
import type { Commands } from '../../interface/system/commands.js';
import type { Archetype } from './archetype.js';
import { createBuffer, type CommandBuffer } from './buffer.js';
import { readCell } from './cells.js';
import { createCommands } from './commands.js';
import { asEntity, indexOf, locate } from './entities.js';
import { createContext, rowBinder, type Context } from './rows.js';
import { idOf, type Key, type State } from './state.js';
import type { Queued } from './synchronize.js';
import type { Essential, ReadonlyValue } from '../../interface/component/value.js';
import type { Leaf } from '../../interface/finalizer/created.js';
import { newestKeyOf } from '../../interface/registry/index.js';

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
};

export const isFinalizer = (value: { readonly kind: string }): value is Finalizer => value.kind === "finalizer" || value.kind === "changes";

export const createFinalizerRunner = (state: State, finalizer: Finalizer): FinalizerRunner => {
    const { declaration } = finalizer;
    const query = finalizer.kind === "finalizer" ? finalizer.declaration.components : undefined;
    const reads = query?.read ?? [];
    // By default every component that isn't derived, including ones a world first meets later; never resources.
    let watches = (id: number): boolean => !state.derived[id] && !state.resources.has(id);
    const watch = finalizer.kind === "changes" ? finalizer.declaration.watch : undefined;
    if (watch !== undefined) {
        // `Finalizer.changes` rejected derived components.
        const watched = new Set(watch.map(key => idOf(state, key)));
        watches = id => watched.has(id);
    }
    const target = { buffer: createBuffer() };
    const commands = createCommands(state, target);
    return {
        finalizer,
        required: [...new Set([...reads, ...query?.has ?? []])].map(key => idOf(state, key)),
        excluded: (query?.not ?? []).map(key => idOf(state, key)),
        watches,
        matches: [],
        context: createContext(state, declaration, { commands }),
        target,
        commands,
        reads,
    };
};

const matches = (runner: FinalizerRunner, archetype: Archetype): boolean => {
    let known = runner.matches[archetype.id] ?? 0;
    if (known === 0) {
        const { storageById } = archetype;
        known = !archetype.resource && runner.required.every(id => storageById[id] !== undefined) && runner.excluded.every(id => storageById[id] === undefined) ? 1 : 2;
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

/** What a finalizer threw, kept for after the sync point applies. */
export type Thrown = { readonly finalizer: Finalizer; readonly error: unknown };

/** Calls `body`, keeping what it throws. */
const guarded = (errors: Thrown[], finalizer: Finalizer, body: () => void): void => {
    try { body(); }
    catch (error) { errors.push({ finalizer, error }); }
};

/** Each entity that stops matching: it matched before, and is despawned, no longer matches, or had a required component replaced. */
const finalizeStops = (state: State, runner: FinalizerRunner, leaf: Leaf, errors: Thrown[]): void => {
    // Rows and contexts are built to each finalizer's declaration, so its body accepts them.
    const finalizer: Untyped = leaf;
    const { plan, archetypes, entities } = state;
    const byArchetype = new Map<Archetype, number[]>();
    for (let entry = 0; entry < plan.count; entry++) {
        const from = fromOf(state, entry);
        if (from === null || !matches(runner, from)) continue;
        const stops = plan.despawned[entry] === 1 || !matches(runner, archetypes[plan.to[entry]])
            || (plan.fresh.get(entry)?.some(id => runner.required.includes(id)) ?? false);
        if (!stops) continue;
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
        const { ids, values } = queued[buffer].buffer;
        let value = found;
        for (let k = start; k < end; k++) if (ids[k] === id) value = values[k];
        return value;
    };
    let value = last(plan.buffer[entry], plan.start[entry], plan.end[entry], missing);
    const more = plan.more.size === 0 ? undefined : plan.more.get(entry);
    if (more !== undefined) for (let r = 0; r < more.length; r += 3) value = last(more[r], more[r + 1], more[r + 2], value);
    return value;
};

export const isMissing = (value: unknown): boolean => value === missing;

/** A watched component's newest key: watched components are registered and not derived, so they're essential. */
const essential = (state: State, id: number): Essential => newestKeyOf(state.keys[id]) as Essential;

/** The sync point's structural changes to a changes finalizer's components, grouped by how they changed. */
const changesOf = (state: State, runner: FinalizerRunner, queued: readonly Queued[]): ChangeSet<Essential> => {
    const { plan, archetypes, entities } = state;
    const { watches } = runner;
    const names = (archetype: Archetype | null): Essential[] | null =>
        archetype === null ? null : archetype.components.filter(watches).map(id => essential(state, id));
    const groups = new Map<string, { from: Essential[] | null; to: Essential[] | null; added: Essential[]; removed: Essential[]; replaced: Essential[]; entities: Entity[] }>();
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
    const add = (entity: number, from: Archetype | null, to: Archetype | null, fresh: readonly number[]): void => {
        // The resource entity's components are resources, not changes.
        if (from?.resource === true || to?.resource === true) return;
        const replaced = fresh.length === 0 ? fresh : fresh.filter(id => watches(id) && from?.storageById[id] !== undefined && to?.storageById[id] !== undefined);
        const { before, after, added, removed } = pairOf(from, to);
        if (replaced.length === 0 && added.length === 0 && removed.length === 0) return;
        const key = `${from?.id ?? -1}:${to?.id ?? -1}:${replaced.join(",")}`;
        let group = groups.get(key);
        if (group === undefined) groups.set(key, group = { from: before, to: after, added, removed, replaced: replaced.map(id => essential(state, id)), entities: [] });
        group.entities.push(asEntity(entity));
    };
    for (let entry = 0; entry < plan.count; entry++) {
        const from = fromOf(state, entry);
        const despawned = plan.despawned[entry] === 1;
        // Spawned and despawned within the sync point: never there before or after.
        if (from === null && despawned) continue;
        add(plan.entity[entry], from, despawned ? null : archetypes[plan.to[entry]], plan.fresh.get(entry) ?? []);
    }
    // Batch spawns no command touched, which have no entry.
    for (const [id, first] of state.born ?? []) {
        const archetype = archetypes[id];
        for (let row = first; row < archetype.count; row++) {
            const entity = archetype.entities[row];
            if ((plan.slots[indexOf(entity)] ?? -1) < 0) add(entity, null, archetype, []);
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

/**
 * Runs every finalizer against the planned sync point, before it applies, in their order. Their commands queue for the
 * next sync point. Returns the errors they threw, for after the sync point applies.
 */
export const runFinalizers = (state: State, queued: readonly Queued[], born: Map<number, number>): Thrown[] => {
    const errors: Thrown[] = [];
    state.born = born;
    try {
        for (const runner of state.finalizers) {
            runner.context.bind();
            const { finalizer } = runner;
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
    }
    finally {
        state.born = null;
    }
    return errors;
};

/** At disposal: every per-query finalizer runs for every live entity it matches, so the handles they release are. */
export const finalizeAll = (state: State): Thrown[] => {
    const errors: Thrown[] = [];
    for (const runner of state.finalizers) {
        const { finalizer: leaf } = runner;
        if (leaf.kind !== "finalizer") continue;
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
