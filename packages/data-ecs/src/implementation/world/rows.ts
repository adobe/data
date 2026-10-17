import type { Entity } from '../../types/entity/entity.js';
import type { Declaration } from '../../types/system/declaration.js';
import type { Lookup } from '../../types/system/access.js';
import type { Commands } from '../../types/system/commands.js';
import type { Layout, TypedArray } from '../../types/registry/layout.js';
import { stampChanged, writeF32Lanes, writeGeneral, writeOf, type Archetype, type Storage } from './archetype.js';
import { readCell, writeCell } from './cells.js';
import { locate } from './entities.js';
import { findResource, resourceCell, type ResourceCell } from './resources.js';
import { idOf, type Key, type State } from './state.js';
import { combine, contributed, identityOf, type ReductionTarget } from './reductions.js';

/** One declared component's storage in the archetype a row is bound to, and the typed array its scalar leaves are read through. */
type Slot = { storage: Storage; view: TypedArray };

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
    readonly bind: (archetype: Archetype) => void;
};

/** Chosen once per component, so a read doesn't dispatch on the layout; tuples of f32 lanes are read as array literals. */
const getterOf = (layout: Layout, slot: Slot, row: Row): () => unknown => {
    if (layout.kind === "constant") {
        const { value } = layout;
        return () => value;
    }
    if (layout.kind === "object") return () => slot.storage.values[row.index];
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

const setterOf = (state: State, layout: Layout, slot: Slot, row: Row): (value: unknown) => void => {
    if (layout.kind === "constant") return () => stampChanged(slot.storage, row.index, state.tick);
    if (layout.kind === "object") return value => {
        const { storage } = slot;
        storage.values[row.index] = value;
        stampChanged(storage, row.index, state.tick);
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
        stampChanged(storage, index, state.tick);
    };
    if (write !== writeGeneral) return value => {
        const { index } = row;
        slot.view[index * unitStride + unitOffset] = Number(value);
        stampChanged(slot.storage, index, state.tick);
    };
    return value => {
        const { storage } = slot;
        layout.write(storage.views, row.index, value);
        stampChanged(storage, row.index, state.tick);
    };
};

/** The view a slot's scalar leaves are read through: their own for a scalar or f32 lanes, unused otherwise. */
const viewOf = (storage: Storage): TypedArray => {
    const { layout } = storage;
    return layout.kind === "linear" && storage.write !== writeGeneral ? storage.views[layout.leaves[0].view] : storage.views.f32;
};

const slotOf = (archetype: Archetype, id: number): Slot => {
    const storage = archetype.storageById[id];
    // A system matches only archetypes with every component it reads or writes.
    if (storage === undefined) throw new Error(`Archetype ${archetype.id} lacks component ${id}.`);
    return { storage, view: viewOf(storage) };
};

const createRow = (state: State, archetype: Archetype, keys: readonly Key[], ids: readonly number[], writes: readonly Key[]): Row => {
    const slots = ids.map(id => slotOf(archetype, id));
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
                const { storage, view } = slotOf(next, ids[i]);
                slots[i].storage = storage;
                slots[i].view = view;
            }
        },
    };
    Object.defineProperty(value, "entity", { get: () => row.entities[row.index], enumerable: true });
    keys.forEach((key, i) => {
        const layout = state.layouts[ids[i]];
        Object.defineProperty(value, key, {
            get: getterOf(layout, slots[i], row),
            set: writes.includes(key) ? setterOf(state, layout, slots[i], row) : undefined,
            enumerable: true,
        });
    });
    return row;
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
 * Binds the accessor row for `reads` and `writes` to an archetype. The row is shared by every main-thread system that
 * declares the same ones, so a body sees one row shape whichever system or archetype it runs over. Main-thread systems
 * run one at a time, so a binding lasts for one system's pass over one archetype.
 */
export const rowBinder = (state: State, reads: readonly Key[], writes: readonly Key[]): (archetype: Archetype) => Row => {
    const keys = [...new Set([...reads, ...writes])];
    const ids = keys.map(key => idOf(state, key));
    const signature = keys.map((key, i) => writes.includes(key) ? `${ids[i]}w` : `${ids[i]}`).join(",");
    return archetype => {
        let row = state.rows.get(signature);
        if (row === undefined) {
            row = createRow(state, archetype, keys, ids, writes);
            state.rows.set(signature, row);
        }
        else row.bind(archetype);
        return row;
    };
};

/**
 * A lookup's matcher, with its component ids resolved once. `find` returns the row of a live entity that matches, or -1,
 * leaving its archetype in `archetype`.
 */
const createMatcher = (state: State, lookup: Lookup) => {
    const ids = (keys: readonly Key[] | undefined): number[] => (keys ?? []).map(key => idOf(state, key));
    const read = ids(lookup.read);
    const has = ids(lookup.has);
    const not = ids(lookup.not);
    const matcher = {
        read,
        archetype: null as Archetype | null,
        find: (entity: Entity): number => {
            const index = locate(state.entities, entity);
            if (index < 0) return -1;
            const archetype = state.archetypes[state.entities.archetype[index]];
            if (archetype.resource) return -1;
            const { storageById } = archetype;
            for (let i = 0; i < read.length; i++) if (storageById[read[i]] === undefined) return -1;
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

/** A lookup returning `read` values keyed by component, for main-thread systems. */
export const createObjectLookup = (state: State, lookup: Lookup) => {
    const matcher = createMatcher(state, lookup);
    const keys = lookup.read ?? [];
    return (entity: Entity): object | null => {
        const row = matcher.find(entity);
        const { archetype } = matcher;
        if (row < 0 || archetype === null) return null;
        const values: { [key: Key]: unknown } = {};
        for (let i = 0; i < keys.length; i++) values[keys[i]] = readAt(archetype, row, matcher.read[i]);
        return values;
    };
};

/** A lookup returning `read` values in declared order, for kernels. */
export const createArrayLookup = (state: State, lookup: Lookup) => {
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
 * A body's context: its resources, lookups, reductions, input and commands, each under its own key and present only
 * when declared. `bind` resolves the resources' cells for a run; `reduced[t]` holds the leaves of the fold into its
 * `t`th reduction target so far this run.
 */
export type Context = { readonly value: { input?: unknown; up?: unknown }; readonly bind: () => void; readonly reduced: readonly Float64Array[] };

/** What a context holds beyond the declaration's resources and lookups. */
type Extras = { readonly targets?: readonly ReductionTarget[]; readonly commands?: Commands; readonly input?: boolean };

/** An object with its own prototype, so it gets its own root map, as rows do. */
const own = (): object => Object.create({});

/** Resource cells are resolved once per run: they move only at sync points. An unresolved resource throws on access. */
export const createContext = (state: State, declaration: Pick<Declaration, "lookup" | "resources">, { targets = [], commands, input = false }: Extras = {}): Context => {
    const value: { input?: unknown; up?: unknown } = own();
    const { lookup, resources } = declaration;
    const names = Object.keys(lookup ?? {});
    if (names.length > 0) {
        const lookups = own();
        for (const name of names) Object.defineProperty(lookups, name, { value: createObjectLookup(state, lookup?.[name] ?? {}), enumerable: true });
        Object.defineProperty(value, "lookup", { value: lookups, enumerable: true });
    }
    const writes = new Set<Key>(resources?.write);
    const keys = [...new Set<Key>([...resources?.read ?? [], ...resources?.is ?? [], ...writes])];
    const cells: (ResourceCell | undefined)[] = keys.map(() => undefined);
    if (keys.length > 0) {
        const values = own();
        keys.forEach((key, i) => {
            const cellOf = (): ResourceCell => cells[i] ?? resourceCell(state, key);
            Object.defineProperty(values, key, {
                get: () => {
                    const { storage, row } = cellOf();
                    return readCell(storage, row);
                },
                set: writes.has(key) ? (next: unknown) => {
                    const { storage, row } = cellOf();
                    writeCell(storage, row, next);
                    stampChanged(storage, row, state.tick);
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
    if (input) value.input = undefined;
    if (commands !== undefined) Object.defineProperty(value, "commands", { value: commands, enumerable: true });
    const bind = (): void => {
        for (let i = 0; i < keys.length; i++) cells[i] = findResource(state, keys[i]);
        for (let t = 0; t < targets.length; t++) reduced[t]?.fill(identityOf(targets[t].operator));
    };
    return { value, bind, reduced };
};
