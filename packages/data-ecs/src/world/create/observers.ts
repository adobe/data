import type { Failure } from '../report.js';
import { failureOf } from './failures.js';
import type { Entity } from '../../entity/entity.js';
import type { Archetype } from './archetype.js';
import { indexOf, locate } from './entities.js';
import { readEntity, type EntityOptions } from './reads.js';
import { idOf, startTicking, type Key, type State } from './state.js';

type Notify = (value: unknown) => void;

/** A resource with observers: the tick it was last checked at, and its observers, null where one stopped. */
type Watched = { readonly key: Key; readonly id: number; seen: number; readonly notifies: (Notify | null)[]; stopped: number };

/** An entity observer: the component ids it lists, required first, or null for the whole entity. */
type EntityObserver = { notify: Notify | null; readonly options: EntityOptions | undefined; readonly ids: readonly number[] | null; readonly required: number };

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
        const { components } = current;
        for (let i = 0; i < components.length; i++) if (changedAfter(current, components[i], row, seen)) return true;
        return false;
    }
    for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        if (previous !== null && previous !== current && (previous.storageById[id] === undefined) !== (current.storageById[id] === undefined)) return true;
        if (changedAfter(current, id, row, seen)) return true;
    }
    return false;
};

/**
 * The world's observers. A new observer is given the current value during the call that subscribes; one that throws
 * then throws to the caller. `deliver` runs after each run's sync point: each observed resource whose changed tick moved
 * since it was last checked notifies its observers once, with its value then; so does each observed entity whose watched
 * components' presence or changed ticks moved, or that died: each is located again, so a different archetype or
 * generation shows a structural change, and nothing is allocated when nothing observed changed.
 */
export const createObservers = (state: State, read: (key: Key) => unknown) => {
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
    /** Components entity observers watch, which keep ticks and kernels' stamps; `pending` ones don't yet. */
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

    const entity = (entity: Entity, options: EntityOptions | undefined) => (notify: Notify) => {
        const required = options?.required ?? [];
        const ids = options === undefined ? null : [...required, ...options.optional ?? []].map(key => idOf(state, key));
        let entry = byEntity.get(entity);
        if (entry === undefined) {
            const index = locate(state.entities, entity);
            entry = { entity, archetype: index < 0 ? -1 : state.entities.archetype[index], row: index < 0 ? 0 : state.entities.row[index], seen: state.tick, observers: [], stopped: 0 };
            byEntity.set(entity, entry);
            entities.push(entry);
        }
        const observed = entry;
        const observer: EntityObserver = { notify, options, ids, required: required.length };
        observed.observers.push(observer);
        if (ids !== null) for (const id of ids) request(id);
        else if (observed.archetype >= 0) requestAll(state.archetypes[observed.archetype]);
        let active = true;
        const stop = (): void => {
            if (!active) return;
            active = false;
            observer.notify = null;
            observed.stopped++;
        };
        try {
            notify(readEntity(state, entity, options));
        }
        catch (error) {
            stop();
            throw error;
        }
        return stop;
    };

    /**
     * Before a run: starts ticks and kernels' stamps for the components entity observers requested since the last one.
     * Returns whether it did, so kernels that dropped those stamps load again. Ticks start at the current tick, which every
     * observed entity is then checked at, so starting them isn't a change.
     */
    const start = (): boolean => {
        if (pending.length === 0) return false;
        startTicking(state, pending);
        for (const id of pending) state.observed.add(id);
        pending.length = 0;
        for (const entry of entities) entry.seen = state.tick;
        return true;
    };

    /** After a failed registration's rollback, which restores the kernels' stamps it had: keeps those entity observers watch. */
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
                if (notify === null) continue;
                if (!changedFor(observer, previous, current, entry.row, seen)) continue;
                try {
                    notify(readEntity(state, entry.entity, observer.options));
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
    };

    /** Notifies the observers of each resource the run changed; returns their failures, or null. */
    const deliver = (): Failure[] | null => {
        sweep();
        let failures: Failure[] | null = null;
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
                    (failures ??= []).push(failureOf("observer", String(entry.key), error));
                }
            }
        }
        return deliverEntities(failures);
    };

    return { resource, entity, deliver, start, reassert };
};
