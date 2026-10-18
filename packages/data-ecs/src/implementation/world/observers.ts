import type { Failure } from '../../interface/world/report.js';
import { failureOf } from './failures.js';
import type { Entity } from '../../interface/entity/entity.js';
import type { Archetype, Storage } from './archetype.js';
import { indexOf, locate } from './entities.js';
import { journalEnd } from './journal.js';
import { chunkShift } from './kernel.js';
import { compileQuery, countOf, createSelectScratch, elsewhere, matchesArchetype, readEntity, selectInto, type CompiledQuery, type EntityOptions, type QueryOptions } from './reads.js';
import type { MoveLog } from './move-log.js';
import { idOf, startTicking, type Key, type State } from './state.js';
import { labelOf } from '../../interface/registry/index.js';

type Notify = (value: unknown) => void;

/** A resource with observers: the tick it was last checked at, and its observers, null where one stopped. */
type Watched = { readonly key: Key; readonly id: number; seen: number; readonly notifies: (Notify | null)[]; stopped: number };

/**
 * An entity observer: the component ids it lists, required first, or null for the whole entity; `primed` once it had
 * its first value, which waits for a readback while a GPU kernel's writes it needs are on the GPU; and `watching` once
 * its components keep ticks, before which every run may have changed it.
 */
type EntityObserver = {
    notify: Notify | null;
    primed: boolean;
    watching: boolean;
    readonly options: EntityOptions | undefined;
    /** For a joined thread's observer: its log, whose objects it reads there. */
    readonly owner: MoveLog | null;
    readonly ids: readonly number[] | null;
    readonly required: number;
};

/**
 * A query observer: its compiled query and the components its `where` and `order` read; the archetypes it matches, of
 * the first `classified`, and by id; their row total, the tick and whether ticks were kept for `watched` when last
 * checked; and its last value.
 */
type QueryObserver = {
    notify: Notify | null;
    primed: boolean;
    readonly name: string;
    readonly counting: boolean;
    readonly query: CompiledQuery;
    readonly watched: readonly number[];
    readonly matching: Archetype[];
    readonly matchingById: boolean[];
    classified: number;
    total: number;
    seen: number;
    watching: boolean;
    selected: readonly Entity[];
    counted: number;
};

/** What runs the world's tasks one at a time, between runs. */
type Queue = (task: () => Promise<void>) => Promise<void>;

/**
 * An observed entity, shared by its observers: its archetype id and row when last checked, -1 while dead; the tick it
 * was last checked at; and its observers, null where one stopped.
 */
type WatchedEntity = { readonly entity: Entity; archetype: number; row: number; seen: number; readonly observers: EntityObserver[]; stopped: number };

/** Whether an archetype has the observer's required components, so its value isn't null. */
const hasRequired = (archetype: Archetype | null, observer: EntityObserver): boolean => {
    if (archetype === null) return false;
    const { ids, required } = observer;
    if (ids === null) return true;
    for (let i = 0; i < required; i++) if (archetype.storageById[ids[i]] === undefined) return false;
    return true;
};

/** Whether a storage's value at a row changed after `seen`; unknown, so not, until it keeps ticks. */
const changedAfter = (archetype: Archetype, id: number, row: number, seen: number): boolean => {
    const storage = archetype.storageById[id];
    return storage !== undefined && storage.ticked && (storage.changed[row] > seen || storage.columnChanged > seen);
};

/** Whether what an observer watches changed between two checks of its entity: aliveness, listed components' presence, or their values. */
const changedFor = (observer: EntityObserver, previous: Archetype | null, current: Archetype | null, row: number, seen: number): boolean => {
    const was = hasRequired(previous, observer);
    const is = hasRequired(current, observer);
    if (was !== is) return true;
    if (current === null || !is) return false;
    const { ids } = observer;
    if (ids === null) {
        if (previous !== current) return true;
        const { storages } = current;
        for (let i = 0; i < storages.length; i++) {
            // A joined thread's objects are part of the value only for its own observer.
            const { remote } = storages[i];
            if ((remote === null || remote === observer.owner) && changedAfter(current, storages[i].component, row, seen)) return true;
        }
        return false;
    }
    for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        if (previous !== null && previous !== current && (previous.storageById[id] === undefined) !== (current.storageById[id] === undefined)) return true;
        if (changedAfter(current, id, row, seen)) return true;
    }
    return false;
};

/** Whether a ticked storage's changed ticks, in its first `count` rows, or its column's are newer than `seen`. */
const changedSince = (storage: Storage, count: number, seen: number): boolean => {
    if (storage.columnChanged > seen) return true;
    const chunks = (count + (1 << chunkShift) - 1) >> chunkShift;
    const { chunkChanged } = storage;
    for (let c = 0; c < chunks; c++) if (chunkChanged[c] > seen) return true;
    return false;
};

/**
 * The world's observers. A new observer is given the current value during the call that subscribes, where one that
 * throws throws to the caller; while a GPU kernel's writes it needs are on the GPU, it gets it through the world's
 * queue once they're read back, where one that throws is a failure of the next run. `readback` runs after each run, for
 * the GPU writes observers need, then `deliver`: each observed resource whose changed tick moved since it was last
 * checked notifies its observers once, with its value then; so does each observed entity whose watched components'
 * presence or changed ticks moved, or that died, each located again, so a different archetype or generation shows a
 * structural change; and each query whose result differs. Nothing is allocated when nothing observed changed.
 */
export const createObservers = (state: State, read: (key: Key) => unknown, enqueue: Queue) => {
    /** Failures of first values given through the queue, reported with the next run's. */
    const deferred: Failure[] = [];
    /** While `deliver` notifies, stopped query observers are swept after it rather than at once. */
    let delivering = false;

    const watched: Watched[] = [];
    const byKey = new Map<Key, Watched>();

    /** The resource's changed tick, or -1 while it isn't in the world. */
    const changedTick = (id: number): number => {
        if (state.resourceEntity < 0) return -1;
        const index = indexOf(state.resourceEntity);
        const storage = state.archetypes[state.entities.archetype[index]]?.storageById[id];
        return storage === undefined ? -1 : storage.changed[state.entities.row[index]];
    };

    const resource = (key: Key) => (notify: Notify) => {
        const id = idOf(state, key);
        if (state.remote[id] !== undefined) throw elsewhere(state, id);
        let entry = byKey.get(key);
        if (entry === undefined) {
            entry = { key, id: idOf(state, key), seen: state.tick, notifies: [], stopped: 0 };
            byKey.set(key, entry);
            watched.push(entry);
        }
        const observed = entry;
        observed.notifies.push(notify);
        let active = true;
        const stop = (): void => {
            if (!active) return;
            active = false;
            const at = observed.notifies.indexOf(notify);
            if (at >= 0) {
                observed.notifies[at] = null;
                observed.stopped++;
            }
        };
        try {
            notify(read(key));
        }
        catch (error) {
            stop();
            throw error;
        }
        return stop;
    };

    const entities: WatchedEntity[] = [];
    const byEntity = new Map<Entity, WatchedEntity>();
    /** Components entity and query observers watch, which keep ticks and kernels' stamps; `pending` ones don't yet. */
    const requested = new Set<number>();
    const pending: number[] = [];

    const request = (id: number): void => {
        if (requested.has(id)) return;
        requested.add(id);
        pending.push(id);
    };

    /** Requests the components of an archetype a whole-entity observer's entity is in. */
    const requestAll = (archetype: Archetype): void => {
        const { components } = archetype;
        for (let i = 0; i < components.length; i++) if (!requested.has(components[i])) request(components[i]);
    };

    const entity = (entity: Entity, options: EntityOptions | undefined, owner: MoveLog | null = null) => (notify: Notify) => {
        const required = options?.required ?? [];
        const ids = options === undefined ? null : [...required, ...options.optional ?? []].map(key => idOf(state, key));
        if (ids !== null) for (const id of ids) if (state.remote[id] !== undefined && state.remote[id] !== owner) throw elsewhere(state, id);
        let entry = byEntity.get(entity);
        if (entry === undefined) {
            const index = locate(state.entities, entity);
            entry = { entity, archetype: index < 0 ? -1 : state.entities.archetype[index], row: index < 0 ? 0 : state.entities.row[index], seen: state.tick, observers: [], stopped: 0 };
            byEntity.set(entity, entry);
            entities.push(entry);
        }
        const observed = entry;
        const observer: EntityObserver = { notify, primed: false, watching: true, options, owner, ids, required: required.length };
        observed.observers.push(observer);
        if (ids !== null) for (const id of ids) request(id);
        else if (observed.archetype >= 0) requestAll(state.archetypes[observed.archetype]);
        // Until its components' ticks and kernels' stamps start, at the next run, every run is a candidate.
        const listed = ids ?? (observed.archetype < 0 ? [] : state.archetypes[observed.archetype].components);
        observer.watching = listed.every(id => !pending.includes(id));
        let active = true;
        const stop = (): void => {
            if (!active) return;
            active = false;
            observer.notify = null;
            observed.stopped++;
        };
        const first = (): void => {
            observer.primed = true;
            notify(readEntity(state, entity, options, owner));
        };
        const ahead = new Set<Storage>();
        aheadForEntity(entity, observer, ahead);
        if (ahead.size === 0) {
            try {
                first();
            }
            catch (error) {
                stop();
                throw error;
            }
        }
        else void enqueue(async () => {
            ahead.clear();
            aheadForEntity(entity, observer, ahead);
            await readBack(ahead);
            if (observer.notify === null) return;
            try {
                first();
            }
            catch (error) {
                stop();
                deferred.push(failureOf("observer", String(entity), error));
            }
        });
        return stop;
    };

    /** Adds the storages of an entity's observed components with GPU writes the CPU hasn't seen. */
    const aheadForEntity = (entity: Entity, observer: EntityObserver, out: Set<Storage>): void => {
        const { gpu } = state;
        if (gpu === null || !gpu.anyAhead()) return;
        const index = locate(state.entities, entity);
        if (index < 0) return;
        const archetype = state.archetypes[state.entities.archetype[index]];
        const { ids } = observer;
        if (ids === null) {
            for (const storage of archetype.storages) if (gpu.isAhead(storage)) out.add(storage);
            return;
        }
        for (const id of ids) {
            const storage = archetype.storageById[id];
            if (storage !== undefined && gpu.isAhead(storage)) out.add(storage);
        }
    };

    const readBack = async (storages: ReadonlySet<Storage>): Promise<void> => {
        if (storages.size > 0) await state.gpu?.readback([...storages]);
    };

    const queries: QueryObserver[] = [];
    /** The journal's position read up to, while any query is observed. */
    let position = 0;
    let reading = false;
    /** Reused while comparing selections: the latest, and by entity index the pass that listed an entity in the last. */
    let scratch: Entity[] = [];
    /** Reused by paged selections with an `order`. */
    const selecting = createSelectScratch();
    let listedPass = new Int32Array(0);
    let listedEntity = new Float64Array(0);
    let pass = 0;

    /** Brings a query's matching archetypes up to date with the world's, which only grow. */
    const classify = (observer: QueryObserver): void => {
        const { archetypes } = state;
        for (; observer.classified < archetypes.length; observer.classified++) {
            const archetype = archetypes[observer.classified];
            const matches = matchesArchetype(archetype, observer.query);
            observer.matchingById.push(matches);
            if (matches) observer.matching.push(archetype);
        }
    };

    const totalOf = (observer: QueryObserver): number => {
        let total = 0;
        for (const archetype of observer.matching) total += archetype.count;
        return total;
    };

    /** Adds the storages a query's `where` and `order` read with GPU writes the CPU hasn't seen. */
    const aheadForQuery = (observer: QueryObserver, out: Set<Storage>): void => {
        const { gpu } = state;
        if (gpu === null || observer.watched.length === 0 || !gpu.anyAhead()) return;
        classify(observer);
        for (const archetype of observer.matching) {
            if (archetype.count === 0) continue;
            for (const id of observer.watched) {
                const storage = archetype.storageById[id];
                if (storage !== undefined && gpu.isAhead(storage)) out.add(storage);
            }
        }
    };

    /** A query's value now, with what later checks compare against. */
    const valueOf = (observer: QueryObserver): number | readonly Entity[] => {
        classify(observer);
        observer.total = totalOf(observer);
        observer.seen = state.tick;
        if (observer.counting) return observer.counted = countOf(state, observer.query);
        const selected: Entity[] = [];
        selected.length = selectInto(state, observer.query, selected, selecting);
        return observer.selected = selected;
    };

    /** Whether the first `count` entities of `scratch` are what the observer last selected: in its order, or with no `order`, in any. */
    const sameSelection = (observer: QueryObserver, count: number): boolean => {
        const last = observer.selected;
        if (last.length !== count) return false;
        let i = 0;
        while (i < count && last[i] === scratch[i]) i++;
        if (i === count) return true;
        if (observer.query.order.length > 0) return false;
        const mark = ++pass;
        if (listedPass.length < state.entities.length) {
            listedPass = new Int32Array(state.entities.archetype.length);
            listedEntity = new Float64Array(state.entities.archetype.length);
        }
        for (let n = i; n < count; n++) {
            const index = indexOf(last[n]);
            listedPass[index] = mark;
            listedEntity[index] = last[n];
        }
        for (let n = i; n < count; n++) {
            const entity = scratch[n];
            const index = indexOf(entity);
            if (index >= listedPass.length || listedPass[index] !== mark || listedEntity[index] !== entity) return false;
        }
        return true;
    };

    const removeQuery = (observer: QueryObserver): void => {
        const at = queries.indexOf(observer);
        if (at >= 0) queries.splice(at, 1);
        if (queries.length === 0 && reading) {
            reading = false;
            state.journal.readers--;
        }
    };

    const query = (options: QueryOptions, counting: boolean) => (notify: Notify) => {
        const compiled = compileQuery(state, options);
        const watched = [...new Set([...compiled.where.map(({ id }) => id), ...compiled.order.map(({ id }) => id)])];
        const observer: QueryObserver = {
            notify, primed: false, name: (options.required ?? []).map(labelOf).join(", "), counting, query: compiled, watched,
            matching: [], matchingById: [], classified: 0, total: 0, seen: state.tick, watching: true, selected: [], counted: 0,
        };
        for (const id of watched) request(id);
        // Until its components' ticks and kernels' stamps start, at the next run, every run is a candidate.
        observer.watching = watched.every(id => !pending.includes(id));
        if (!reading) {
            reading = true;
            state.journal.readers++;
            position = journalEnd(state.journal);
        }
        queries.push(observer);
        let active = true;
        const stop = (): void => {
            if (!active) return;
            active = false;
            observer.notify = null;
            if (!delivering) removeQuery(observer);
        };
        const first = (): void => {
            observer.primed = true;
            notify(valueOf(observer));
        };
        const ahead = new Set<Storage>();
        aheadForQuery(observer, ahead);
        if (ahead.size === 0) {
            try {
                first();
            }
            catch (error) {
                stop();
                throw error;
            }
        }
        else void enqueue(async () => {
            ahead.clear();
            aheadForQuery(observer, ahead);
            await readBack(ahead);
            if (observer.notify === null) return;
            try {
                first();
            }
            catch (error) {
                stop();
                deferred.push(failureOf("observer", observer.name, error));
            }
        });
        return stop;
    };

    /** Whether the journal lists, since the last delivery, an entity now in an archetype the query matches. */
    const journalLists = (observer: QueryObserver, end: number): boolean => {
        const { journal, entities } = state;
        const { matchingById } = observer;
        for (let at = position; at < end; at++) {
            const archetype = entities.archetype[journal.indexes[at - journal.first]];
            if (archetype >= 0 && matchingById[archetype]) return true;
        }
        return false;
    };

    /** Whether a `where` or `order` component may have changed in a matching archetype since the last check. */
    const valuesChanged = (observer: QueryObserver): boolean => {
        const { watched, seen } = observer;
        if (watched.length === 0) return false;
        for (const archetype of observer.matching) {
            if (archetype.count === 0) continue;
            for (let i = 0; i < watched.length; i++) {
                const storage = archetype.storageById[watched[i]];
                if (storage !== undefined && changedSince(storage, archetype.count, seen)) return true;
            }
        }
        return false;
    };

    /**
     * Notifies each query observer whose result the run changed. A cheap check finds candidates first: the journal lists
     * an entity now in a matching archetype, or dropped entries; the matching archetypes' row total moved, as it does when
     * one that matched leaves; or a `where` or `order` component's ticks moved in one. Only candidates are recomputed.
     */
    const deliverQueries = (failures: Failure[] | null): Failure[] | null => {
        if (queries.length === 0) return failures;
        const { journal } = state;
        const end = journalEnd(journal);
        const dropped = position < journal.first;
        const tick = state.tick;
        for (let q = 0, count = queries.length; q < count; q++) {
            const observer = queries[q];
            const notify = observer.notify;
            if (notify === null || !observer.primed) continue;
            classify(observer);
            const total = totalOf(observer);
            const candidate = !observer.watching || dropped || total !== observer.total || journalLists(observer, end) || valuesChanged(observer);
            observer.total = total;
            observer.seen = tick;
            if (!candidate) continue;
            let value: number | readonly Entity[];
            if (observer.counting) {
                const counted = countOf(state, observer.query);
                if (counted === observer.counted) continue;
                value = observer.counted = counted;
            }
            else {
                const selected = selectInto(state, observer.query, scratch, selecting);
                if (sameSelection(observer, selected)) continue;
                value = observer.selected = scratch.slice(0, selected);
            }
            try {
                notify(value);
            }
            catch (error) {
                (failures ??= []).push(failureOf("observer", observer.name, error));
            }
        }
        position = end;
        return failures;
    };

    /**
     * Before a run: starts ticks and kernels' stamps for the components entity and query observers requested since the last one.
     * Returns whether it did, so kernels that dropped those stamps load again. Ticks start at the current tick, which every
     * observed entity is then checked at, so starting them isn't a change.
     */
    const start = (): boolean => {
        if (pending.length === 0) return false;
        startTicking(state, pending);
        for (const id of pending) state.observed.add(id);
        pending.length = 0;
        for (const entry of entities) {
            entry.seen = state.tick;
            for (const observer of entry.observers) observer.watching = true;
        }
        for (const observer of queries) observer.watching = true;
        return true;
    };

    /** After a failed registration's rollback, which restores the kernels' stamps it had: keeps those observers watch. */
    const reassert = (): void => {
        for (const id of requested) state.observed.add(id);
    };

    /** Notifies the observers of each entity whose watched components the run changed. */
    const deliverEntities = (failures: Failure[] | null): Failure[] | null => {
        const tick = state.tick;
        for (let w = 0, count = entities.length; w < count; w++) {
            const entry = entities[w];
            const before = entry.archetype;
            // Located again, which checks its generation: it may have despawned, or moved archetype or row.
            const index = locate(state.entities, entry.entity);
            entry.archetype = index < 0 ? -1 : state.entities.archetype[index];
            entry.row = index < 0 ? 0 : state.entities.row[index];
            const seen = entry.seen;
            entry.seen = tick;
            const after = entry.archetype;
            if (before < 0 && after < 0) continue;
            const previous = before < 0 ? null : state.archetypes[before];
            const current = after < 0 ? null : state.archetypes[after];
            // A whole-entity observer's entity in another archetype: its components need ticks too.
            if (current !== null && previous !== current) for (let n = 0; n < entry.observers.length; n++) {
                if (entry.observers[n].notify !== null && entry.observers[n].ids === null) {
                    requestAll(current);
                    break;
                }
            }
            // Observers added while notifying start with the next run.
            for (let n = 0, observers = entry.observers.length; n < observers; n++) {
                const observer = entry.observers[n];
                const notify = observer.notify;
                if (notify === null || !observer.primed) continue;
                // Not yet watching, it's changed unless it was null and still is.
                const changed = observer.watching
                    ? changedFor(observer, previous, current, entry.row, seen)
                    : hasRequired(previous, observer) || hasRequired(current, observer);
                if (!changed) continue;
                try {
                    notify(readEntity(state, entry.entity, observer.options, observer.owner));
                }
                catch (error) {
                    (failures ??= []).push(failureOf("observer", String(entry.entity), error));
                }
            }
        }
        return failures;
    };

    /** Drops stopped observers, and resources nothing observes. */
    const sweep = (): void => {
        for (let w = watched.length - 1; w >= 0; w--) {
            const entry = watched[w];
            if (entry.stopped === 0) continue;
            let kept = 0;
            for (const notify of entry.notifies) if (notify !== null) entry.notifies[kept++] = notify;
            entry.notifies.length = kept;
            entry.stopped = 0;
            if (kept > 0) continue;
            watched.splice(w, 1);
            byKey.delete(entry.key);
        }
        for (let w = entities.length - 1; w >= 0; w--) {
            const entry = entities[w];
            if (entry.stopped === 0) continue;
            let kept = 0;
            for (const observer of entry.observers) if (observer.notify !== null) entry.observers[kept++] = observer;
            entry.observers.length = kept;
            entry.stopped = 0;
            if (kept > 0) continue;
            entities.splice(w, 1);
            byEntity.delete(entry.entity);
        }
        for (let q = queries.length - 1; q >= 0; q--) if (queries[q].notify === null) removeQuery(queries[q]);
    };

    /** After a run, before `deliver`: reads back the GPU writes observers need, or null when there are none. */
    const readback = (): Promise<void> | null => {
        const { gpu } = state;
        if (gpu === null || !gpu.anyAhead()) return null;
        const ahead = new Set<Storage>();
        for (const entry of entities) for (const observer of entry.observers) {
            if (observer.notify !== null && observer.primed) aheadForEntity(entry.entity, observer, ahead);
        }
        for (const observer of queries) if (observer.notify !== null && observer.primed) aheadForQuery(observer, ahead);
        return ahead.size === 0 ? null : readBack(ahead);
    };

    /** Notifies the observers of each resource, entity and query the run changed; returns their failures, or null. */
    const deliver = (): Failure[] | null => {
        sweep();
        let failures: Failure[] | null = deferred.length === 0 ? null : deferred.splice(0);
        const tick = state.tick;
        for (let w = 0; w < watched.length; w++) {
            const entry = watched[w];
            const changed = changedTick(entry.id);
            const moved = changed > entry.seen;
            entry.seen = tick;
            if (!moved) continue;
            const value = read(entry.key);
            // Observers added while notifying start with the next run.
            for (let n = 0, count = entry.notifies.length; n < count; n++) {
                const notify = entry.notifies[n];
                if (notify === null) continue;
                try {
                    notify(value);
                }
                catch (error) {
                    (failures ??= []).push(failureOf("observer", labelOf(entry.key), error));
                }
            }
        }
        delivering = true;
        try {
            return deliverQueries(deliverEntities(failures));
        }
        finally {
            delivering = false;
        }
    };

    /** A failure for the next delivery's report. */
    const defer = (failure: Failure): void => { deferred.push(failure); };

    return { resource, entity, query, readback, deliver, start, reassert, defer };
};
