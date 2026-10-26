// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, type Resource, type World } from '../interface/index.js';
import type { Observe } from './observe.js';
import { createEntry, give, giveFirst, labelled, none, noDelivery, passed, scheduleRead, stateOf, subscribe, sweepSubscribers, throwFailed, type Entry, type Read, type Shape, type WorldState } from './world-state.js';

/**
 * A resource's observers, sharing one value: `notifier`, added, gives the value after each pass whose sync point
 * stamped it; `reader`, run for cold first values, gives them the value as of its run's sync point, which a stamp
 * before it then doesn't give them again in the same pass.
 */
type ResourceShape = Shape & {
    readonly entry: Entry<unknown>;
    readonly read: Read;
    /**
     * On a joined thread, a run of the notifier: its first run once added passes its filter, as the world starts it
     * from tick 0, so once it resolved the entry holds the value.
     */
    readonly joinedRead: Read;
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
    const label = `Observe.resource(${key.description ?? "?"})`;
    // On a joined thread, first values come once a run of this system resolved, never in its pass: none to skip.
    const { joined } = state;
    const notifier = System.create(labelled({ observer: true, resources: { changed: [key] } }, label, { resources: [key] }), ({ resources }) => {
        passed(state);
        entry.value = resources[key];
        entry.valid = true;
        if (entry.stopped > 0) sweepSubscribers(entry);
        throwFailed(give(entry, 0, true, state.pass, joined ? -1 : state.pass, none));
    });
    const reader = System.create(labelled({ observer: true }, label, { resources: [key] }), ({ resources }) => {
        const through = shape.called.shift() ?? 0;
        entry.value = resources[key];
        entry.valid = true;
        // The maintenance system counts this pass after the run's own systems, before the notifier runs in it.
        give(entry, through, false, state.pass + 1, -1, none);
    });
    const shape: ResourceShape = {
        live: 0,
        idle: 0,
        entry,
        called: [],
        read: { system: reader, flushed: batch => { shape.called.push(batch); }, delivered: noDelivery },
        joinedRead: { system: notifier, flushed: noDelivery, delivered: batch => { giveFirst(state, entry, batch); } },
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
        // Throws on a joined thread for a resource it can't read, adding nothing.
        world.add(shape.notifier);
        shape.attached = true;
    }
    // A resource key's values have its type, which `members.ts` gives `T` by the key's declaration.
    const entry = shape.entry as Entry<T>;
    return subscribe(state, shape, entry, notify, () => scheduleRead(state, state.joined ? shape.joinedRead : shape.read));
};
