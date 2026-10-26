// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from '../../interface/entity/entity.js';
import type { Resolved } from '../../interface/system/declaration.js';
import type { SystemLookupLists } from '../../interface/system/access.js';
import type { Commands } from '../../interface/system/commands.js';
import type { Layout, TypedArray } from '../../interface/registry/layout.js';
import { stampChanged, writeF32Lanes, writeGeneral, writeOf, type Archetype, type Storage } from './archetype.js';
import { readCell, writeCell } from './cells.js';
import { readString, writeString } from './strings.js';
import { indexOf, locate } from './entities.js';
import { ownTag } from './move-log.js';
import { resourceCell } from './resources.js';
import { labelOf } from '../../interface/registry/names.js';
import { idOf, type Key, type State } from './state.js';
import { combine, contributed, identityOf, type ReductionTarget } from './reductions.js';
import { createIndexLookup, type Since } from './index-lookups.js';
import type { WorldIndex } from './indexes.js';

/**
 * What an accessor row reads and writes: a storage, or a joined thread's view of one. A joined thread's own objects
 * have `tags`, the world's tags of their rows, which a write marks as the thread's own value.
 */
export type RowStorage = Pick<Storage, "layout" | "views" | "strings" | "values" | "write" | "ticked" | "added" | "changed" | "chunkAdded" | "chunkChanged" | "blockAdded" | "blockChanged" | "tags">;

/** What a row binds to: an archetype, or a joined thread's view of one. */
export type RowArchetype = { readonly id: number; readonly entities: Float64Array; readonly storageById: readonly (RowStorage | undefined)[] };

/**
 * What rows need of their world: layouts by component id, the rows made so far, the running system's tick, and on a
 * joined thread, that its strings are read out of their records, since only the world's thread holds their values.
 */
export type RowHost = { readonly layouts: readonly Layout[]; readonly rows: Map<string, Row>; readonly tick: number; readonly records?: true };

/** One declared component's storage in the archetype a row is bound to, and the typed array its scalar leaves are read through. */
type Slot = { storage: RowStorage; view: TypedArray; value: unknown };

/**
 * An accessor row for the declared components of a system. `bind` points it at an archetype's storages and `index`
 * selects the row. Reads copy linear values out; writes replace the whole value and stamp `changed` with the running
 * system's tick.
 */
export type Row = {
    readonly value: object;
    index: number;
    entities: Float64Array;
    /** Points the row at another archetype's storages. Views are replaced only at sync points, so a binding lasts a pass. */
    readonly bind: (archetype: RowArchetype) => void;
};

/** A constant storage's value, a shared component's its archetype's, found once per binding. */
const constantOf = (storage: RowStorage): unknown => storage.layout.kind === "constant" ? storage.layout.value : undefined;

/** Chosen once per component, so a read doesn't dispatch on the layout; tuples of f32 lanes are read as array literals. */
const getterOf = (host: RowHost, layout: Layout, slot: Slot, row: Row): () => unknown => {
    // A shared component's value is the bound archetype's.
    if (layout.kind === "constant" && layout.shared === true) return () => slot.value;
    if (layout.kind === "constant") {
        const { value } = layout;
        return () => value;
    }
    if (layout.kind === "object" || (layout.kind === "string" && host.records !== true)) return () => slot.storage.values[row.index];
    if (layout.kind === "string") return () => readString(slot.storage, row.index);
    const { write, unitStride, unitOffset, lanes } = writeOf(layout);
    if (write === writeF32Lanes && lanes === 2) return () => {
        const { view } = slot;
        const base = row.index * unitStride + unitOffset;
        return [view[base], view[base + 1]];
    };
    if (write === writeF32Lanes && lanes === 3) return () => {
        const { view } = slot;
        const base = row.index * unitStride + unitOffset;
        return [view[base], view[base + 1], view[base + 2]];
    };
    if (write === writeF32Lanes && lanes === 4) return () => {
        const { view } = slot;
        const base = row.index * unitStride + unitOffset;
        return [view[base], view[base + 1], view[base + 2], view[base + 3]];
    };
    if (write !== writeGeneral && write !== writeF32Lanes) return () => slot.view[row.index * unitStride + unitOffset];
    return () => layout.read(slot.storage.views, row.index);
};

/** A shared component's setter, which fails its system: its value is its archetype's. */
const sharedSetterOf = (key: Key): (value: unknown) => void => () => {
    throw new Error(`"${labelOf(key)}" is shared: its value is its archetype's, so give it another with commands.add rather than assigning it.`);
};

const setterOf = (host: RowHost, layout: Layout, slot: Slot, row: Row): (value: unknown) => void => {
    if (layout.kind === "constant") return () => stampChanged(slot.storage, row.index, host.tick);
    if (layout.kind === "object") return value => {
        const { storage } = slot;
        const { index } = row;
        storage.values[index] = value;
        // A joined thread's own object: the world's tag says its value is the thread's.
        if (storage.tags.length !== 0) storage.tags[index] = ownTag;
        stampChanged(storage, index, host.tick);
    };
    if (layout.kind === "string") return value => {
        const { storage } = slot;
        writeString(storage, row.index, value);
        stampChanged(storage, row.index, host.tick);
    };
    const { write, unitStride, unitOffset, lanes } = writeOf(layout);
    // Array values of f32 lanes and scalars are stored directly, converting as `layout.write` does.
    if (write === writeF32Lanes) return value => {
        const { storage, view } = slot;
        const { index } = row;
        if (Array.isArray(value)) {
            const base = index * unitStride + unitOffset;
            for (let i = 0; i < lanes; i++) view[base + i] = Number(value[i]);
        }
        else layout.write(storage.views, index, value);
        stampChanged(storage, index, host.tick);
    };
    if (write !== writeGeneral) return value => {
        const { index } = row;
        slot.view[index * unitStride + unitOffset] = Number(value);
        stampChanged(slot.storage, index, host.tick);
    };
    return value => {
        const { storage } = slot;
        layout.write(storage.views, row.index, value);
        stampChanged(storage, row.index, host.tick);
    };
};

/** The view a slot's scalar leaves are read through: their own for a scalar or f32 lanes, unused otherwise. */
const viewOf = (storage: RowStorage): TypedArray => {
    const { layout } = storage;
    return layout.kind === "linear" && storage.write !== writeGeneral ? storage.views[layout.leaves[0].view] : storage.views.f32;
};

const slotOf = (archetype: RowArchetype, id: number): Slot => {
    const storage = archetype.storageById[id];
    // A system matches only archetypes with every component it reads or writes.
    if (storage === undefined) throw new Error(`Archetype ${archetype.id} lacks component ${id}.`);
    return { storage, view: viewOf(storage), value: constantOf(storage) };
};

/** An optional component's getter where the archetype lacks it, and its setter, which fails its system. */
const absentGetter = (): undefined => undefined;
const absentSetterOf = (key: Key): (value: unknown) => void => () => {
    throw new Error(`An entity lacks "${labelOf(key)}", optional in its system: add it with commands.add rather than assigning it.`);
};

/** A present optional component's setter, which fails its system for `undefined`: that removes nothing. */
const presentSetterOf = (key: Key, set: (value: unknown) => void): (value: unknown) => void => value => {
    if (value === undefined) throw new Error(`"${labelOf(key)}" was assigned undefined, which removes nothing: remove it with commands.remove.`);
    set(value);
};

/**
 * A row of an archetype's `keys`. `absent` is undefined for a member and, for an optional component, whether the
 * archetype lacks it: one it lacks reads as `undefined` and assigning it fails its system, and one it has fails its
 * system when assigned `undefined`.
 */
export const createRow = (host: RowHost, archetype: RowArchetype, keys: readonly Key[], ids: readonly number[], writes: readonly Key[], absent: readonly (boolean | undefined)[] = []): Row => {
    const slots = ids.map((id, i): Slot | undefined => absent[i] === true ? undefined : slotOf(archetype, id));
    // Its own prototype gives the row its own root map. Rows built from `{}` share one, and defining an accessor with a
    // different getter than an existing transition's makes V8 switch the object to slow dictionary properties.
    const value: object = Object.create({});
    const row: Row = {
        value,
        index: 0,
        entities: archetype.entities,
        bind: next => {
            row.entities = next.entities;
            for (let i = 0; i < ids.length; i++) {
                const slot = slots[i];
                if (slot === undefined) continue;
                const { storage, view, value } = slotOf(next, ids[i]);
                slot.storage = storage;
                slot.view = view;
                slot.value = value;
            }
        },
    };
    Object.defineProperty(value, "entity", { get: () => row.entities[row.index], enumerable: true });
    keys.forEach((key, i) => {
        const layout = host.layouts[ids[i]];
        const slot = slots[i];
        // A shared component is never assigned, whatever the build saw: assigning it fails its system, saying why.
        const shared = layout.kind === "constant" && layout.shared === true;
        Object.defineProperty(value, key, slot === undefined ? {
            get: absentGetter,
            set: shared ? sharedSetterOf(key) : writes.includes(key) ? absentSetterOf(key) : undefined,
            enumerable: true,
        } : {
            get: getterOf(host, layout, slot, row),
            set: shared ? sharedSetterOf(key) : !writes.includes(key) ? undefined : absent[i] === false ? presentSetterOf(key, setterOf(host, layout, slot, row)) : setterOf(host, layout, slot, row),
            enumerable: true,
        });
    });
    return row;
};

/** The row a shared-class row's value reads through, as its accessors' `this`. */
const rowOfValue = Symbol("row");

/** A row of shared class: its slots are its own, for the accessors every row of its shape shares. */
type SharedRow = Row & { readonly slots: Slot[] };

/** A shared-class row's value, as its accessors see it. */
type SharedValue = { readonly [rowOfValue]: SharedRow };

/** As `getterOf`, but one function for every row of a shape, finding its row and slot through the value. */
const sharedGetterOf = (host: RowHost, layout: Layout, i: number): (this: SharedValue) => unknown => {
    if (layout.kind === "constant" && layout.shared === true) return function (this: SharedValue): unknown {
        return this[rowOfValue].slots[i].value;
    };
    if (layout.kind === "constant") {
        const { value } = layout;
        return () => value;
    }
    if (layout.kind === "object" || (layout.kind === "string" && host.records !== true)) return function (this: SharedValue): unknown {
        const row = this[rowOfValue];
        return row.slots[i].storage.values[row.index];
    };
    if (layout.kind === "string") return function (this: SharedValue): unknown {
        const row = this[rowOfValue];
        return readString(row.slots[i].storage, row.index);
    };
    const { write, unitStride, unitOffset, lanes } = writeOf(layout);
    if (write === writeF32Lanes && lanes === 2) return function (this: SharedValue): unknown {
        const row = this[rowOfValue];
        const { view } = row.slots[i];
        const base = row.index * unitStride + unitOffset;
        return [view[base], view[base + 1]];
    };
    if (write === writeF32Lanes && lanes === 3) return function (this: SharedValue): unknown {
        const row = this[rowOfValue];
        const { view } = row.slots[i];
        const base = row.index * unitStride + unitOffset;
        return [view[base], view[base + 1], view[base + 2]];
    };
    if (write === writeF32Lanes && lanes === 4) return function (this: SharedValue): unknown {
        const row = this[rowOfValue];
        const { view } = row.slots[i];
        const base = row.index * unitStride + unitOffset;
        return [view[base], view[base + 1], view[base + 2], view[base + 3]];
    };
    if (write !== writeGeneral && write !== writeF32Lanes) return function (this: SharedValue): unknown {
        const row = this[rowOfValue];
        return row.slots[i].view[row.index * unitStride + unitOffset];
    };
    return function (this: SharedValue): unknown {
        const row = this[rowOfValue];
        return layout.read(row.slots[i].storage.views, row.index);
    };
};

const sharedEntity = function (this: SharedValue): number {
    const row = this[rowOfValue];
    return row.entities[row.index];
};

/**
 * Makes read-only accessor rows for `keys` whose values share one hidden class: every value's own accessors are the
 * same functions, finding the row through the value. A body reading many rows at once, as a list's, sees one map.
 */
export const sharedRows = (host: RowHost, keys: readonly Key[], ids: readonly number[]): (archetype: RowArchetype) => Row => {
    const prototype = {};
    const getters = keys.map((_, i) => sharedGetterOf(host, host.layouts[ids[i]], i));
    return archetype => {
        const value: object = Object.create(prototype);
        const row: SharedRow = {
            value,
            index: 0,
            entities: archetype.entities,
            slots: ids.map(id => slotOf(archetype, id)),
            bind: next => {
                row.entities = next.entities;
                for (let i = 0; i < ids.length; i++) {
                    const { storage, view, value } = slotOf(next, ids[i]);
                    row.slots[i].storage = storage;
                    row.slots[i].view = view;
                    row.slots[i].value = value;
                }
            },
        };
        Object.defineProperty(value, rowOfValue, { value: row });
        Object.defineProperty(value, "entity", { get: sharedEntity, enumerable: true });
        for (let i = 0; i < keys.length; i++) Object.defineProperty(value, keys[i], { get: getters[i], enumerable: true });
        return row;
    };
};

/**
 * Binds a read-only accessor row of its own, for the parents an `up` system reads, to an archetype. It isn't shared,
 * so binding it never moves the row a system runs over, even when both read the same components.
 */
export const parentBinder = (state: State, reads: readonly Key[]): (archetype: Archetype) => Row => {
    const ids = reads.map(key => idOf(state, key));
    let row: Row | null = null;
    return archetype => {
        if (row === null) row = createRow(state, archetype, reads, ids, []);
        else row.bind(archetype);
        return row;
    };
};

/**
 * Binds the accessor row for `reads` and `writes` to an archetype. The row is shared by every system of its host that
 * declares the same ones, so a body sees one row shape whichever system or archetype it runs over. A host's systems
 * run one at a time, so a binding lasts for one system's pass over one archetype. `idOfKey` gives each key's component.
 */
export const rowBinderOf = <A extends RowArchetype>(host: RowHost, idOfKey: (key: Key) => number, reads: readonly Key[], writes: readonly Key[], optional: readonly Key[] = []): (archetype: A) => Row => {
    const keys = [...new Set([...reads, ...writes])];
    const ids = keys.map(idOfKey);
    const signature = keys.map((key, i) => writes.includes(key) ? `${ids[i]}w` : `${ids[i]}`).join(",");
    /** The positions in `keys` of optional components, whose presence in an archetype picks its row. */
    const optionals = keys.flatMap((key, i) => optional.includes(key) ? [i] : []);
    if (optionals.length === 0) return archetype => {
        let row = host.rows.get(signature);
        if (row === undefined) {
            row = createRow(host, archetype, keys, ids, writes);
            host.rows.set(signature, row);
        }
        else row.bind(archetype);
        return row;
    };
    // Each pattern of which optional components an archetype has is a row of its own, so no read checks per row. The
    // pattern marks every key, `-` for a member and `0` or `1` for an optional one absent or present, so systems with
    // the same keys but other optional ones never share a row.
    const absent: (boolean | undefined)[] = keys.map(() => undefined);
    return archetype => {
        let pattern = signature + "|";
        for (let i = 0, next = 0; i < keys.length; i++) {
            if (optionals[next] !== i) {
                pattern += "-";
                continue;
            }
            next++;
            absent[i] = archetype.storageById[ids[i]] === undefined;
            pattern += absent[i] ? "0" : "1";
        }
        let row = host.rows.get(pattern);
        if (row === undefined) {
            row = createRow(host, archetype, keys, ids, writes, [...absent]);
            host.rows.set(pattern, row);
        }
        else row.bind(archetype);
        return row;
    };
};

/** The accessor row binder for main-thread systems of a world. */
export const rowBinder = (state: State, reads: readonly Key[], writes: readonly Key[], optional: readonly Key[] = []): (archetype: Archetype) => Row =>
    rowBinderOf<Archetype>(state, key => idOf(state, key), reads, writes, optional);

/**
 * A lookup's matcher, with its component ids resolved once. `find` returns the row of a live entity that matches, or -1,
 * leaving its archetype in `archetype`.
 */
const createMatcher = (state: State, lookup: SystemLookupLists) => {
    const ids = (keys: readonly Key[] | undefined): number[] => (keys ?? []).map(key => idOf(state, key));
    const read = ids(lookup.read);
    const has = ids("has" in lookup ? lookup.has : undefined);
    const not = ids("not" in lookup ? lookup.not : undefined);
    // What it reads but its optional components, which an entity it finds may lack.
    const optional = ids("optional" in lookup ? lookup.optional : undefined);
    const required = read.filter(id => !optional.includes(id));
    const matcher = {
        read,
        archetype: null as Archetype | null,
        find: (entity: Entity): number => {
            const index = locate(state.entities, entity);
            if (index < 0) return -1;
            const archetype = state.archetypes[state.entities.archetype[index]];
            if (archetype.resource) return -1;
            const { storageById } = archetype;
            for (let i = 0; i < required.length; i++) if (storageById[required[i]] === undefined) return -1;
            for (let i = 0; i < has.length; i++) if (storageById[has[i]] === undefined) return -1;
            for (let i = 0; i < not.length; i++) if (storageById[not[i]] !== undefined) return -1;
            const row = state.entities.row[index];
            // While finalizers run, rows spawned in the same sync point aren't alive yet.
            if (state.born !== null && row >= (state.born.get(archetype.id) ?? Infinity)) return -1;
            matcher.archetype = archetype;
            return row;
        },
    };
    return matcher;
};

const readAt = (archetype: Archetype, row: number, id: number): unknown => {
    const storage = archetype.storageById[id];
    return storage === undefined ? undefined : readCell(storage, row);
};

/** What a lookup by entity reading nothing gives every entity it finds. */
export const emptyRow: object = {};

/** A lookup by entity's row with `changed`: its `read` values by component, and `changed`. */
export type ChangedRow = { [key: Key]: unknown; changed: boolean };

/** A row for a lookup's `read` and `changed`, every field present from the start, so its writes keep one hidden class. */
export const changedRowOf = (keys: readonly Key[]): ChangedRow => {
    const row: ChangedRow = { changed: false };
    for (let i = 0; i < keys.length; i++) row[keys[i]] = undefined;
    return row;
};

/**
 * Whether a component of `ids` may have changed in an archetype's row after `since`: its row's or its column's tick is
 * newer, or it keeps no ticks, so it's unknown.
 */
const changedAt = (archetype: Archetype, row: number, ids: readonly number[], since: number): boolean => {
    if (since < 0) return true;
    const { storageById } = archetype;
    for (let i = 0; i < ids.length; i++) {
        const storage = storageById[ids[i]];
        if (storage === undefined || !storage.ticked || storage.changed[row] > since || storage.columnChanged > since) return true;
    }
    return false;
};

/**
 * A lookup returning `read` values keyed by component, for main-thread systems: a new object each call, the shared
 * empty one for a lookup reading nothing, and with `changed` one row reused, its `changed` as of `since`.
 */
export const createObjectLookup = (state: State, lookup: SystemLookupLists, since: Since) => {
    const matcher = createMatcher(state, lookup);
    const keys = lookup.read ?? [];
    const watched = "index" in lookup ? undefined : lookup.changed;
    if (watched !== undefined) {
        const ids = watched.map(key => idOf(state, key));
        const found = changedRowOf(keys);
        return (entity: Entity): object | null => {
            const row = matcher.find(entity);
            const { archetype } = matcher;
            if (row < 0 || archetype === null) return null;
            for (let i = 0; i < keys.length; i++) found[keys[i]] = readAt(archetype, row, matcher.read[i]);
            found.changed = changedAt(archetype, row, ids, since.value);
            return found;
        };
    }
    if (keys.length === 0) return (entity: Entity): object | null => matcher.find(entity) < 0 ? null : emptyRow;
    return (entity: Entity): object | null => {
        const row = matcher.find(entity);
        const { archetype } = matcher;
        if (row < 0 || archetype === null) return null;
        const values: { [key: Key]: unknown } = {};
        for (let i = 0; i < keys.length; i++) values[keys[i]] = readAt(archetype, row, matcher.read[i]);
        return values;
    };
};

/**
 * A lookup returning `read` values in declared order, for kernels: a new array each call, and with `changed` one array
 * reused, whether a component it watches may have changed after `since` last.
 */
export const createArrayLookup = (state: State, lookup: SystemLookupLists, since: Since) => {
    const watched = "index" in lookup ? undefined : lookup.changed;
    return watched === undefined ? createPlainArrayLookup(state, lookup) : createChangedArrayLookup(state, lookup, watched.map(key => idOf(state, key)), since);
};

const createChangedArrayLookup = (state: State, lookup: SystemLookupLists, ids: readonly number[], since: Since) => {
    const matcher = createMatcher(state, lookup);
    const { read } = matcher;
    const values = new Array<unknown>(read.length + 1);
    return (entity: Entity): readonly unknown[] | null => {
        const row = matcher.find(entity);
        const { archetype } = matcher;
        if (row < 0 || archetype === null) return null;
        for (let i = 0; i < read.length; i++) values[i] = readAt(archetype, row, read[i]);
        values[read.length] = changedAt(archetype, row, ids, since.value);
        return values;
    };
};

const createPlainArrayLookup = (state: State, lookup: SystemLookupLists) => {
    const matcher = createMatcher(state, lookup);
    const { read } = matcher;
    return (entity: Entity): readonly unknown[] | null => {
        const row = matcher.find(entity);
        const { archetype } = matcher;
        if (row < 0 || archetype === null) return null;
        const values = new Array<unknown>(read.length);
        for (let i = 0; i < read.length; i++) values[i] = readAt(archetype, row, read[i]);
        return values;
    };
};

/**
 * A body's context: its resources, lookups, reductions and commands, each under its own key and present only
 * when declared. `bind` resolves the resources' cells for a run; `reduced[t]` holds the leaves of the fold into its
 * `t`th reduction target so far this run.
 */
export type Context = { readonly value: { up?: unknown }; readonly bind: () => void; readonly reduced: readonly Float64Array[] };

/**
 * What a context holds beyond the declaration's resources and lookups, and for lookups through indexes, the index of
 * each by name and the `lastRun` their lists compare with.
 */
type Extras = {
    readonly targets?: readonly ReductionTarget[];
    readonly commands?: Commands;
    readonly indexes?: ReadonlyMap<string, WorldIndex>;
    readonly since?: Since;
};

/** The `lastRun` of a context without one, as a finalizer's: every list counts as changed. */
const never: Since = { value: -1 };

/** An object with its own prototype, so it gets its own root map, as rows do. */
const own = (): object => Object.create({});

/** Resource cells are resolved once per run: they move only at sync points. An unresolved resource throws on access. */
export const createContext = (state: State, declaration: Pick<Resolved, "lookup" | "resources">, { targets = [], commands, indexes, since = never }: Extras = {}): Context => {
    const value: { up?: unknown } = own();
    const { lookup, resources } = declaration;
    const names = Object.keys(lookup ?? {});
    if (names.length > 0) {
        const lookups = own();
        for (const name of names) {
            const declared = lookup?.[name] ?? {};
            const index = indexes?.get(name);
            const found = index === undefined || !("index" in declared) ? createObjectLookup(state, declared, since) : createIndexLookup(state, index, declared, since);
            Object.defineProperty(lookups, name, { value: found, enumerable: true });
        }
        Object.defineProperty(value, "lookup", { value: lookups, enumerable: true });
    }
    const writes = new Set<Key>(resources?.write);
    const keys = [...new Set<Key>([...resources?.read ?? [], ...resources?.is ?? [], ...writes])];
    const ids = keys.map(key => idOf(state, key));
    /** By key, its storage in the resource entity's archetype as of `bind`, and the entity's row there. */
    const storages: (Storage | undefined)[] = keys.map(() => undefined);
    let row = 0;
    if (keys.length > 0) {
        const values = own();
        keys.forEach((key, i) => {
            Object.defineProperty(values, key, {
                get: () => {
                    const storage = storages[i];
                    if (storage !== undefined) return readCell(storage, row);
                    // Throws, as for a resource not in this world.
                    const cell = resourceCell(state, key);
                    return readCell(cell.storage, cell.row);
                },
                set: writes.has(key) ? (next: unknown) => {
                    let storage = storages[i];
                    let at = row;
                    if (storage === undefined) {
                        const cell = resourceCell(state, key);
                        storage = cell.storage;
                        at = cell.row;
                    }
                    writeCell(storage, at, next);
                    stampChanged(storage, at, state.tick);
                } : undefined,
                enumerable: true,
            });
        });
        Object.defineProperty(value, "resources", { value: values, enumerable: true });
    }
    // Each resource it reduces is a function folding a value into the run's accumulators, leaf by leaf.
    const reduced = targets.map(target => new Float64Array(target.leaves.length));
    if (targets.length > 0) {
        const reducers = own();
        targets.forEach((target, t) => {
            const accumulators = reduced[t];
            const { operator, leaves } = target;
            Object.defineProperty(reducers, target.key, {
                value: (contribution: unknown): void => {
                    if (accumulators === undefined) return;
                    for (let i = 0; i < leaves.length; i++) accumulators[i] = combine(operator, accumulators[i] ?? NaN, contributed(contribution, leaves[i]?.path ?? []));
                },
                enumerable: true,
            });
        });
        Object.defineProperty(value, "reduce", { value: reducers, enumerable: true });
    }
    if (commands !== undefined) Object.defineProperty(value, "commands", { value: commands, enumerable: true });
    const bind = (): void => {
        if (keys.length > 0) {
            const index = state.resourceEntity < 0 ? -1 : indexOf(state.resourceEntity);
            const archetype = index < 0 ? undefined : state.archetypes[state.entities.archetype[index]];
            row = index < 0 ? 0 : state.entities.row[index];
            for (let i = 0; i < keys.length; i++) storages[i] = archetype?.storageById[ids[i]];
        }
        for (let t = 0; t < targets.length; t++) reduced[t]?.fill(identityOf(targets[t].operator));
    };
    return { value, bind, reduced };
};
