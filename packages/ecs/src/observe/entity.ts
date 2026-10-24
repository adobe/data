// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index, System, type Component, type Entity, type World } from '../interface/index.js';
import type { Observe } from './observe.js';
import { createEntry, give, giveFirst, keysId, labelOf, labelled, none, noDelivery, ownName, passed, scheduleDelivery, scheduleRead, stateOf, subscribe, sweepSubscribers, throwFailed, type Entry, type Read, type Shape, type WorldState } from './world-state.js';

/** An observed entity's value, shared by its observers, and by optional component whether it had it last. */
type EntityEntry = Entry<object | null> & { readonly entity: Entity; readonly present: boolean[] };

/**
 * The entities observed with one list of required and optional components, read by one observer system that looks each
 * up by entity; with no optional components, it skips them while an index of what has the required ones reports no
 * change. `swept` is false while an entry may have no subscribers.
 */
type EntityShape = Shape & {
    readonly system: System;
    /** On a joined thread, a run of its system, once resolved giving first values its pass read. */
    readonly read: Read;
    /** Whether its system is added: it's removed once the shape has been idle for a pass, and added again on use. */
    attached: boolean;
    readonly entries: EntityEntry[];
    readonly byEntity: Map<Entity, EntityEntry>;
    waiting: boolean;
    swept: boolean;
};

/** By world, its entity observers' shapes, kept for its life, so their systems register in it once. */
const shapes = new WeakMap<WorldState, Map<string, EntityShape>>();

/** Indexes of the entities with every component of a list, by its id: one per list in the program. */
const memberIndexes = new Map<string, Index<{ readonly key: readonly []; readonly components: { readonly with: readonly Component.Key[] } }>>();

const membersOf = (required: readonly Component.Key[]) => {
    const id = keysId(required);
    let index = memberIndexes.get(id);
    if (index === undefined) memberIndexes.set(id, index = Index.create(labelled({ key: [], components: { with: [...required] } }, `Observe.entity(${labelOf(required)})`)));
    return index;
};

/** A by-entity lookup's row: whether a component it watches changed since its system last ran. */
type PresenceRow = { readonly changed: boolean };

/** A by-entity lookup's row of the components it reads, and whether one changed since its system last ran. */
type LookupRow = { readonly changed: boolean } & { readonly [K in Component.Key]: unknown };

/** What a pass finds an entity by: whether it has the required components and they changed, their values, and an optional one's. */
type Finders = {
    readonly presence: (entity: Entity) => PresenceRow | null;
    readonly values: (entity: Entity) => { readonly [K in Component.Key]?: unknown } | null;
    readonly optional: (index: number, entity: Entity) => LookupRow | null;
};

const createShape = (state: WorldState, byShape: Map<string, EntityShape>, id: string, required: readonly Component.Key[], optional: readonly Component.Key[]): EntityShape => {
    const name = ownName(`Observe.entity(${labelOf(required)}${optional.length === 0 ? "" : `; ${labelOf(optional)}`})`);
    const rows: (LookupRow | null)[] = optional.map(() => null);
    /**
     * Reads an entry's entity, giving its value if it changed and first values to subscribers waiting up to `through`:
     * its required values only once they changed, a new object each time.
     */
    const evaluate = (entry: EntityEntry, finders: Finders, through: number, failed: unknown): unknown => {
        const found = finders.presence(entry.entity);
        let changed: boolean;
        if (found === null) changed = !entry.valid || entry.value !== null;
        else {
            changed = !entry.valid || entry.value === null || found.changed;
            for (let i = 0; i < optional.length; i++) {
                const row = rows[i] = finders.optional(i, entry.entity);
                const present = row !== null;
                if (present !== entry.present[i] || (present && row.changed)) changed = true;
            }
        }
        if (changed) {
            if (found === null) entry.value = null;
            else if (optional.length === 0) entry.value = finders.values(entry.entity);
            else {
                const value: { [key: symbol]: unknown } = {};
                const values = required.length === 0 ? null : finders.values(entry.entity);
                for (let i = 0; i < required.length; i++) value[required[i]] = values?.[required[i]];
                for (let i = 0; i < optional.length; i++) {
                    const row = rows[i];
                    entry.present[i] = row !== null;
                    if (row !== null) value[optional[i]] = row[optional[i]];
                }
                entry.value = value;
            }
            entry.valid = true;
        }
        if (!changed && entry.waiting === 0) return failed;
        return give(entry, through, changed, state.pass, -1, failed);
    };
    /** Drops entries found without subscribers in three passes, as shapes are; returns whether any is left without them. */
    const sweep = (): boolean => {
        const { entries } = shape;
        let kept = 0;
        let idle = false;
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            if (entry.stopped > 0) sweepSubscribers(entry);
            if (entry.live === 0) {
                if (++entry.idle > 2) {
                    shape.byEntity.delete(entry.entity);
                    continue;
                }
                idle = true;
            }
            entries[kept++] = entry;
        }
        entries.length = kept;
        return idle;
    };
    /** Evaluates every entry, or with nothing changed, those whose subscribers wait for a first value. */
    const pass = (changed: boolean, finders: Finders): void => {
        passed(state);
        if (!shape.swept) shape.swept = !sweep();
        if (!changed && !shape.waiting) return;
        const through = state.delivered;
        const { entries } = shape;
        let failed: unknown = none;
        let waiting = false;
        for (let i = 0, count = entries.length; i < count; i++) {
            const entry = entries[i];
            if (changed || (entry.waiting > 0 && !entry.valid)) failed = evaluate(entry, finders, through, failed);
            else if (entry.waiting > 0) failed = give(entry, through, false, state.pass, -1, failed);
            if (entry.waiting > 0) waiting = true;
        }
        shape.waiting = waiting;
        throwFailed(failed);
    };
    /** The finders of the runner whose lookups they are: another, once its system is added again. */
    let finders: Finders | null = null;
    let source: object | null = null;
    const system = optional.length === 0
        ? System.create(labelled({ observer: true, lookup: { presence: { with: required, changed: required }, values: { with: required }, members: { index: membersOf(required), changed: required } } }, name, { lookup: { values: required } }), ({ lookup }) => {
            if (source !== lookup || finders === null) {
                source = lookup;
                finders = { presence: lookup.presence, values: lookup.values, optional: noOptional };
            }
            pass(lookup.members().changed, finders);
        })
        : System.create(labelled({ observer: true, lookup: optionalLookups(required, optional) }, name, { lookup: optionalReads(required, optional) }), ({ lookup }) => {
            if (source !== lookup || finders === null) {
                source = lookup;
                finders = { presence: lookup.presence, values: lookup.values, optional: (index, entity) => lookup[index](entity) };
            }
            pass(true, finders);
        });
    const shape: EntityShape = {
        live: 0,
        idle: 0,
        system,
        read: {
            system,
            flushed: noDelivery,
            delivered: batch => {
                const { entries } = shape;
                for (let i = 0; i < entries.length; i++) giveFirst(state, entries[i], batch);
            },
        },
        attached: false,
        entries: [],
        byEntity: new Map(),
        waiting: false,
        swept: true,
        remove: () => {
            shape.attached = false;
            shape.entries.length = 0;
            shape.byEntity.clear();
            state.world.remove(system);
        },
    };
    byShape.set(id, shape);
    return shape;
};

const noOptional = (): null => null;

type Watched = { readonly with: readonly Component.Key[]; readonly changed: readonly Component.Key[] };

/** Lookups of an entity's required components, whether and what, and one of each optional one, by its position. */
const optionalLookups = (required: readonly Component.Key[], optional: readonly Component.Key[]): {
    readonly presence: { readonly with: readonly Component.Key[]; readonly changed: readonly Component.Key[] };
    readonly values: { readonly with: readonly Component.Key[] };
    readonly [index: number]: Watched;
} => {
    const lookups: { presence: { readonly with: readonly Component.Key[]; readonly changed: readonly Component.Key[] }; values: { readonly with: readonly Component.Key[] }; [index: number]: Watched } = {
        presence: { with: required, changed: required },
        values: { with: required },
    };
    for (let i = 0; i < optional.length; i++) lookups[i] = { with: [optional[i]], changed: [optional[i]] };
    return lookups;
};

/** What the optional shape's body reads of its lookups' rows: the required values, and each optional one. */
const optionalReads = (required: readonly Component.Key[], optional: readonly Component.Key[]): { readonly [name: string]: readonly Component.Key[] } => {
    const reads: { [name: string]: readonly Component.Key[] } = { values: required };
    for (let i = 0; i < optional.length; i++) reads[i] = [optional[i]];
    return reads;
};

export const observeEntity = <T>(world: World, entity: Entity, components: { readonly required?: readonly Component.Key[]; readonly optional?: readonly Component.Key[] }): Observe<T | null> => {
    const required = [...components.required ?? []];
    const optional = [...components.optional ?? []];
    const id = `${keysId(required)};${keysId(optional)}`;
    return notify => {
        const state = stateOf(world);
        let byShape = shapes.get(state);
        if (byShape === undefined) shapes.set(state, byShape = new Map());
        const shape = byShape.get(id) ?? createShape(state, byShape, id, required, optional);
        if (!shape.attached) {
            // Throws on a joined thread for components it can't read, adding nothing.
            world.add(shape.system);
            shape.attached = true;
        }
        let entry = shape.byEntity.get(entity);
        if (entry === undefined) {
            entry = { ...createEntry<object | null>(null), entity, present: optional.map(() => false) };
            shape.byEntity.set(entity, entry);
            shape.entries.push(entry);
        }
        const observed = entry;
        // An entity observer's values have the listed components' types, which `members.ts` gives `T` by the lists.
        const typed = observed as Entry<T | null>;
        const stop = subscribe(state, shape, typed, notify, () => {
            shape.waiting = true;
            if (state.joined) scheduleRead(state, shape.read);
            else scheduleDelivery(state);
        });
        return () => {
            if (observed.live > 0) shape.swept = false;
            stop();
        };
    };
};
