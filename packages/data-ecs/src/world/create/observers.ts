import type { Failure } from '../report.js';
import { failureOf } from './failures.js';
import { indexOf } from './entities.js';
import { idOf, type Key, type State } from './state.js';

type Notify = (value: unknown) => void;

/** A resource with observers: the tick it was last checked at, and its observers, null where one stopped. */
type Watched = { readonly key: Key; readonly id: number; seen: number; readonly notifies: (Notify | null)[]; stopped: number };

/**
 * The world's observers. `deliver` runs after each run's sync point: each observed resource whose changed tick moved
 * since it was last checked notifies its observers once, with its value then. Nothing is checked beyond a tick per
 * observed resource, and nothing is allocated, when nothing observed changed.
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
        return (): void => {
            if (!active) return;
            active = false;
            const at = observed.notifies.indexOf(notify);
            if (at >= 0) {
                observed.notifies[at] = null;
                observed.stopped++;
            }
        };
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
        return failures;
    };

    return { resource, deliver };
};
