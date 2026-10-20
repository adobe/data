import { System, report, type Resource, type World } from '../index.js';
import type { Observe } from './observe.js';
import { createEntry, give, none, scheduleRead, stateOf, subscribe, sweepSubscribers, throwFailed, type Entry, type Read, type Shape, type WorldState } from './world-state.js';

/**
 * A resource's observers, sharing one value: `notifier`, added, gives the value after each pass whose sync point
 * stamped it; `reader`, run for cold first values, gives them the value as of its run's sync point, which a stamp before
 * it then doesn't give them again in the same pass.
 */
type ResourceShape = Shape & {
    readonly entry: Entry<unknown>;
    readonly read: Read;
    readonly notifier: System;
    /** Whether the notifier is added: it's removed once the shape has been idle for a pass, and added again on use. */
    attached: boolean;
    /** The flushes the reader's runs were called for, oldest first. */
    readonly called: number[];
};

/** By world, its resources' shapes, kept for its life, so their systems register in it once. */
const shapes = new WeakMap<WorldState, Map<Resource.Key, ResourceShape>>();

const createShape = (state: WorldState, byKey: Map<Resource.Key, ResourceShape>, key: Resource.Key): ResourceShape => {
    const entry = createEntry<unknown>(undefined);
    // A tick's report takes the failures of its synced systems after they ran, unstamped, so it's never held.
    const held = key !== report;
    const label = `Observe.resource(${key.description ?? "?"})`;
    const notifier = System.create({ name: label, synced: true, resources: { read: [key], changed: [key] } }, ({ resources }) => {
        entry.value = resources[key];
        entry.valid = held;
        if (entry.stopped > 0) sweepSubscribers(entry);
        throwFailed(give(entry, 0, true, state.pass, state.pass, none));
    });
    const reader = System.create({ name: label, synced: true, resources: { read: [key] } }, ({ resources }) => {
        const through = shape.called.shift() ?? 0;
        entry.value = resources[key];
        entry.valid = held;
        // The maintenance system counts this pass after the run's own systems, before the notifier runs in it.
        give(entry, through, false, state.pass + 1, -1, none);
    });
    const shape: ResourceShape = {
        live: 0,
        idle: 0,
        entry,
        called: [],
        read: { system: reader, flushed: batch => { shape.called.push(batch); } },
        notifier,
        attached: false,
        remove: () => {
            shape.attached = false;
            entry.valid = false;
            state.world.remove(notifier);
        },
    };
    byKey.set(key, shape);
    return shape;
};

export const observeResource = <T>(world: World, key: Resource.Key): Observe<T> => notify => {
    const state = stateOf(world);
    let byKey = shapes.get(state);
    if (byKey === undefined) shapes.set(state, byKey = new Map());
    const shape = byKey.get(key) ?? createShape(state, byKey, key);
    if (!shape.attached) {
        shape.attached = true;
        world.add(shape.notifier);
    }
    // A resource key's values have its type, which `members.ts` gives `T` by the key's declaration.
    const entry = shape.entry as Entry<T>;
    return subscribe(state, shape, entry, notify, () => scheduleRead(state, shape.read));
};
