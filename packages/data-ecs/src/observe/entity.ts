import { Index, System, type Component, type Entity, type World } from '../index.js';
import type { Observe } from './observe.js';
import { createEntry, give, keysId, labelOf, none, scheduleDelivery, stateOf, subscribe, sweepSubscribers, throwFailed, type Entry, type Shape, type WorldState } from './world-state.js';

/** An observed entity's value, shared by its observers, and by optional component whether it had it last. */
type EntityEntry = Entry<object | null> & { readonly entity: Entity; readonly present: boolean[] };

/**
 * The entities observed with one list of required and optional components, read by one synced system that looks each
 * up by entity; with no optional components, it skips them while an index of what has the required ones reports no
 * change. `swept` is false while an entry may have no subscribers.
 */
type EntityShape = Shape & {
    readonly system: System;
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
const memberIndexes = new Map<string, Index<{ readonly key: readonly []; readonly components: { readonly has: readonly Component.Key[] } }>>();

const membersOf = (required: readonly Component.Key[]) => {
    const id = keysId(required);
    let index = memberIndexes.get(id);
    if (index === undefined) memberIndexes.set(id, index = Index.create({ name: `Observe.entity(${labelOf(required)})`, key: [], components: { has: [...required] } }));
    return index;
};

/** A by-entity lookup's row: the components it reads, and whether one changed since its system last ran. */
type LookupRow = { readonly changed: boolean } & { readonly [K in Component.Key]: unknown };

const createShape = (state: WorldState, byShape: Map<string, EntityShape>, id: string, required: readonly Component.Key[], optional: readonly Component.Key[]): EntityShape => {
    const name = `Observe.entity(${labelOf(required)}${optional.length === 0 ? "" : `; ${labelOf(optional)}`})`;
    const rows: (LookupRow | null)[] = optional.map(() => null);
    /** Reads an entry's entity, giving its value if it changed and first values to subscribers waiting up to `through`. */
    const evaluate = (entry: EntityEntry, found: LookupRow | null, find: (index: number, entity: Entity) => LookupRow | null, through: number, failed: unknown): unknown => {
        let changed: boolean;
        if (found === null) changed = !entry.valid || entry.value !== null;
        else {
            changed = !entry.valid || entry.value === null || found.changed;
            for (let i = 0; i < optional.length; i++) {
                const row = rows[i] = find(i, entry.entity);
                const present = row !== null;
                if (present !== entry.present[i] || (present && row.changed)) changed = true;
            }
        }
        if (changed) {
            if (found === null) entry.value = null;
            else {
                const value: { [key: symbol]: unknown } = {};
                for (let i = 0; i < required.length; i++) value[required[i]] = found[required[i]];
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
    const pass = (changed: boolean, find: (entity: Entity) => LookupRow | null, findOptional: (index: number, entity: Entity) => LookupRow | null): void => {
        if (!shape.swept) shape.swept = !sweep();
        if (!changed && !shape.waiting) return;
        const through = state.delivered;
        const { entries } = shape;
        let failed: unknown = none;
        let waiting = false;
        for (let i = 0, count = entries.length; i < count; i++) {
            const entry = entries[i];
            if (changed || (entry.waiting > 0 && !entry.valid)) failed = evaluate(entry, find(entry.entity), findOptional, through, failed);
            else if (entry.waiting > 0) failed = give(entry, through, false, state.pass, -1, failed);
            if (entry.waiting > 0) waiting = true;
        }
        shape.waiting = waiting;
        throwFailed(failed);
    };
    const system = optional.length === 0
        ? System.create({ name, synced: true, lookup: { required: { read: required, changed: required }, members: { index: membersOf(required), changed: required } } }, ({ lookup }) => {
            pass(lookup.members().changed, lookup.required, noOptional);
        })
        : System.create({ name, synced: true, lookup: optionalLookups(required, optional) }, ({ lookup }) => {
            pass(true, lookup.required, (index, entity) => lookup[index](entity));
        });
    const shape: EntityShape = {
        live: 0,
        idle: 0,
        system,
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

/** Lookups of an entity's required components, and one of each optional one, by its position. */
const optionalLookups = (required: readonly Component.Key[], optional: readonly Component.Key[]): { readonly required: { readonly read: readonly Component.Key[]; readonly changed: readonly Component.Key[] }; readonly [index: number]: { readonly read: readonly Component.Key[]; readonly changed: readonly Component.Key[] } } => {
    const lookups: { required: { readonly read: readonly Component.Key[]; readonly changed: readonly Component.Key[] }; [index: number]: { readonly read: readonly Component.Key[]; readonly changed: readonly Component.Key[] } } = { required: { read: required, changed: required } };
    for (let i = 0; i < optional.length; i++) lookups[i] = { read: [optional[i]], changed: [optional[i]] };
    return lookups;
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
            shape.attached = true;
            world.add(shape.system);
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
            scheduleDelivery(state);
        });
        return () => {
            if (observed.live > 0) shape.swept = false;
            stop();
        };
    };
};
