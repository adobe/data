// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Layout, Path } from '../../interface/registry/layout.js';
import { declarationOf, labelOf } from '../../interface/registry/names.js';
import { isEntity } from '../../interface/registry/schemas.js';
import type { Schema } from '../../interface/schema/schema.js';
import type { Table } from '../../interface/world/table/table.js';
import { batchOf } from './batches.js';
import { indexOf, reserveRun } from './entities.js';
import { internShared } from './shared.js';
import { claimRows, openRows, writerOf, type Column as BatchColumn } from './staging.js';
import { commandIdOf, type Key, type State } from './state.js';

/** Whether a value of `schema` may hold an entity anywhere in it. */
const holdsEntity = (schema: Schema): boolean => {
    if (isEntity(schema)) return true;
    if ("anyOf" in schema) return schema.anyOf.some(holdsEntity);
    if ("allOf" in schema) return schema.allOf.some(holdsEntity);
    if (!("type" in schema)) return false;
    switch (schema.type) {
        case "array": case "set": return holdsEntity(schema.items);
        case "map": return holdsEntity(schema.keys) || holdsEntity(schema.values);
        case "object": return Object.values(schema.properties).some(holdsEntity);
        default: return false;
    }
};

/** The schema at `path` inside `schema`, through struct fields and tuple items. */
const schemaAt = (schema: Schema, path: Path): Schema | undefined => {
    let at: Schema | undefined = schema;
    for (const step of path) {
        if (at === undefined || !("type" in at)) return undefined;
        if (at.type === "object" && typeof step === "string") at = at.properties[step];
        else if (at.type === "array" && typeof step === "number") at = at.items;
        else return undefined;
    }
    return at;
};

/** The f64 leaves of a linear layout holding entities: where, in f64 elements, each row's is. */
const entityLeavesOf = (layout: Layout, schema: Schema | undefined): readonly { readonly unitStride: number; readonly unitOffset: number }[] => {
    if (layout.kind !== "linear" || schema === undefined) return [];
    return layout.leaves.filter(leaf => {
        const leafSchema = schemaAt(schema, leaf.path);
        return leaf.view === "f64" && leafSchema !== undefined && isEntity(leafSchema);
    });
};

/** The entity each entity of the tables given is spawned as, and what a value naming none of them becomes. */
type Remap = (entity: number) => number;

/** `value` of `schema` with each entity in it replaced by `remap`'s. */
const remapValue = (schema: Schema, value: unknown, remap: Remap): unknown => {
    if (isEntity(schema)) return typeof value === "number" ? remap(value) : value;
    if (!holdsEntity(schema)) return value;
    if ("anyOf" in schema) {
        for (const member of schema.anyOf) {
            if (isEntity(member) && typeof value === "number") return remap(value);
            if (!("type" in member) || !holdsEntity(member)) continue;
            if ((member.type === "array" && Array.isArray(value)) || (member.type === "set" && value instanceof Set) || (member.type === "map" && value instanceof Map)
                || (member.type === "object" && typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Set) && !(value instanceof Map))) return remapValue(member, value, remap);
        }
        return value;
    }
    if ("allOf" in schema) return schema.allOf.reduce<unknown>((next, member) => remapValue(member, next, remap), value);
    if (!("type" in schema)) return value;
    switch (schema.type) {
        case "array": return Array.isArray(value) ? value.map(item => remapValue(schema.items, item, remap)) : value;
        case "set": return value instanceof Set ? new Set(Array.from(value, item => remapValue(schema.items, item, remap))) : value;
        case "map": return value instanceof Map ? new Map(Array.from(value, ([key, item]) => [remapValue(schema.keys, key, remap), remapValue(schema.values, item, remap)])) : value;
        case "object": {
            if (typeof value !== "object" || value === null) return value;
            const copy: { [name: string]: unknown } = {};
            for (const name of Object.keys(value)) {
                const field = schema.properties[name];
                const item: unknown = Reflect.get(value, name);
                copy[name] = field === undefined ? item : remapValue(field, item, remap);
            }
            return copy;
        }
        default: return value;
    }
};

/** A table's components with their ids, the columns given for them, and their layouts. */
type Planned = {
    readonly table: Table;
    readonly keys: readonly Key[];
    readonly ids: readonly number[];
    readonly shared: (number | undefined)[];
};

/** Throws, naming the component, for a column that doesn't fit its component's layout or its table's count. */
const checkColumn = (state: State, key: Key, id: number, column: Table.Column, count: number): void => {
    const layout = state.layouts[id];
    const fail = (message: string): never => { throw new Error(`commands.spawnTables: "${labelOf(key)}" ${message}.`); };
    if (state.shared[id] !== undefined) {
        if (column.kind !== "value") fail("is a shared component, so its column is one value");
        return;
    }
    if (layout.kind === "constant" || column.kind === "value") return;
    if (layout.kind === "linear") {
        if (column.kind !== "bytes") fail("is stored as bytes, so its column gives bytes");
        else if (column.stride !== layout.stride) fail(`has a stride of ${layout.stride} bytes in this world, not ${column.stride}`);
        else if (column.bytes.length !== count * layout.stride) fail(`gives ${column.bytes.length} bytes for ${count} rows of ${layout.stride}`);
        return;
    }
    if (column.kind !== "values") fail("is stored as values, so its column gives values");
    else if (column.values.length !== count) fail(`gives ${column.values.length} values for ${count} rows`);
};

/** The plan of each table: its keys, their command ids, and the numbers of its shared values. Throws for one that won't spawn. */
const planOf = (state: State, table: Table): Planned => {
    const { count, entities, columns } = table;
    if (!Number.isInteger(count) || count < 0 || entities.length !== count) throw new Error(`commands.spawnTables: a table of ${count} rows gives ${entities.length} entities.`);
    const keys = Object.getOwnPropertySymbols(columns).filter(key => Reflect.get(columns, key) !== undefined);
    const ids = keys.map(key => commandIdOf(state, key));
    const shared: (number | undefined)[] = [];
    keys.forEach((key, k) => {
        const column: Table.Column = Reflect.get(columns, key);
        checkColumn(state, key, ids[k], column, count);
        const values = state.shared[ids[k]];
        if (values !== undefined && column.kind === "value") {
            const number = internShared(values, column.value);
            if (number < 0) throw new Error(`commands.spawnTables: "${labelOf(key)}", a shared component, isn't given one of its type's values: ${labelOf(column.value)}.`);
            shared[ids[k]] = number;
        }
    });
    return { table, keys, ids, shared };
};

/**
 * Where each entity of the tables is, by its index: the entity itself, to tell it from another of that index, and its
 * position among all the tables' rows. Throws for an entity two rows name.
 */
const placesOf = (plans: readonly Planned[]): { readonly entities: Float64Array; readonly positions: Int32Array } => {
    let largest = 0;
    for (const { table } of plans) for (let row = 0; row < table.count; row++) largest = Math.max(largest, indexOf(table.entities[row]));
    const entities = new Float64Array(largest + 1).fill(-1);
    const positions = new Int32Array(largest + 1);
    let position = 0;
    for (const { table } of plans) {
        for (let row = 0; row < table.count; row++) {
            const entity = table.entities[row];
            const index = indexOf(entity);
            if (entities[index] === entity) throw new Error(`commands.spawnTables: entity ${entity} is in two rows.`);
            entities[index] = entity;
            positions[index] = position++;
        }
    }
    return { entities, positions };
};

/** A reference column's entity value in each row: the f64 at the row's start, a reference's whole value. */
const referencesOf = (column: Table.Column): ((row: number) => number) => {
    if (column.kind !== "bytes") return () => 0;
    const view = new DataView(column.bytes.buffer, column.bytes.byteOffset, column.bytes.byteLength);
    const { stride } = column;
    return row => view.getFloat64(row * stride, true);
};

/** Copies a table's `rows`, or all of them, of one column into rows `start` on of a batch's column, remapping entities. */
const copyColumn = (target: BatchColumn, column: Table.Column, schema: Schema | undefined, rows: readonly number[] | null, count: number, start: number, remap: Remap | null): void => {
    const rowAt = (i: number): number => rows === null ? i : rows[i];
    const remapped = remap !== null && schema !== undefined && holdsEntity(schema);
    if (column.kind === "value") {
        const write = writerOf(target, column.value);
        const value = remapped ? remapValue(schema, column.value, remap) : column.value;
        for (let i = 0; i < count; i++) write(start + i, value);
        return;
    }
    if (column.kind === "bytes") {
        const { stride } = target;
        if (rows === null) target.views.u8.set(column.bytes, start * stride);
        else for (let i = 0; i < count; i++) target.views.u8.set(column.bytes.subarray(rows[i] * stride, (rows[i] + 1) * stride), (start + i) * stride);
        if (!remapped) return;
        const { f64 } = target.views;
        for (const leaf of entityLeavesOf(target.layout, schema)) {
            for (let row = start, end = start + count; row < end; row++) {
                const index = row * leaf.unitStride + leaf.unitOffset;
                f64[index] = remap(f64[index]);
            }
        }
        return;
    }
    if (target.remote !== null && column.values.some(value => value !== undefined && value !== null)) throw new Error(target.remote);
    for (let i = 0; i < count; i++) {
        const value = column.values[rowAt(i)];
        target.values[start + i] = remapped ? remapValue(schema, value, remap) : value;
    }
};

/** Spawns `rows` of a plan's table, or all of them, with the components it holds but `removed`, as `entities`. */
const spawnRows = (state: State, { table, keys, ids, shared }: Planned, rows: readonly number[] | null, removed: ReadonlySet<Key>, entities: Float64Array, remap: Remap | null): void => {
    const kept = keys.flatMap((key, k) => removed.has(key) ? [] : [k]);
    const batch = batchOf(state, kept.map(k => ids[k]), shared.length === 0 ? undefined : shared);
    const start = openRows(batch, entities.length);
    for (const k of kept) {
        const target = batch.columns.find(column => column.id === ids[k]);
        if (target === undefined || target.layout.kind === "constant") continue;
        const column: Table.Column = Reflect.get(table.columns, keys[k]);
        copyColumn(target, column, declarationOf(keys[k])?.type, rows, entities.length, start, remap);
    }
    claimRows(batch, entities);
};

/**
 * Spawns an entity for each row of `tables` into the batches of their components, as references would leave them had
 * the entities outside the tables despawned: a row owned, directly or through others, by an entity outside them isn't
 * spawned; a weak reference to one is removed; and any other entity value naming one is `Entity.none`. Every entity
 * value naming an entity spawned names the one spawned for it.
 */
export const spawnTables = (state: State, tables: readonly Table[]): Table.Spawned => {
    const plans = tables.map(table => planOf(state, table));
    // Entities are mapped only where a value of the tables may hold one.
    const remapping = plans.some(({ keys }) => keys.some(key => {
        const schema = declarationOf(key)?.type;
        return schema !== undefined && holdsEntity(schema);
    }));
    const none: ReadonlySet<Key> = new Set();
    if (!remapping) {
        const entities = plans.map(({ table }) => {
            const spawned = new Float64Array(table.count);
            reserveRun(state.entities, spawned);
            return spawned;
        });
        plans.forEach((plan, t) => spawnRows(state, plan, null, none, entities[t], null));
        return { entities, dropped: 0 };
    }
    const places = placesOf(plans);
    const positionOf = (entity: number): number => {
        const index = indexOf(entity);
        return entity !== 0 && index < places.entities.length && places.entities[index] === entity ? places.positions[index] : -1;
    };
    const firsts: number[] = [];
    let total = 0;
    for (const { table } of plans) {
        firsts.push(total);
        total += table.count;
    }
    // A row owned by an entity outside the tables isn't spawned, nor anything it owns, as despawning its owner would.
    const dropped = new Uint8Array(total);
    /** Each owner reference between rows of the tables: the owned row's position, and its owner's. */
    const ownedRows: number[] = [];
    const ownerRows: number[] = [];
    const waiting: number[] = [];
    plans.forEach(({ table, keys }, t) => {
        for (const key of keys) {
            if (declarationOf(key)?.reference !== "owner") continue;
            const ownerAt = referencesOf(Reflect.get(table.columns, key));
            for (let row = 0; row < table.count; row++) {
                const owner = ownerAt(row);
                if (owner === 0) continue;
                const at = positionOf(owner);
                const position = firsts[t] + row;
                if (at >= 0) {
                    ownedRows.push(position);
                    ownerRows.push(at);
                }
                else if (dropped[position] === 0) {
                    dropped[position] = 1;
                    waiting.push(position);
                }
            }
        }
    });
    if (waiting.length > 0) {
        const owned = new Map<number, number[]>();
        for (let i = 0; i < ownedRows.length; i++) {
            const list = owned.get(ownerRows[i]);
            if (list === undefined) owned.set(ownerRows[i], [ownedRows[i]]);
            else list.push(ownedRows[i]);
        }
        for (let next = waiting.pop(); next !== undefined; next = waiting.pop()) {
            for (const child of owned.get(next) ?? []) {
                if (dropped[child] !== 0) continue;
                dropped[child] = 1;
                waiting.push(child);
            }
        }
    }
    const spawnedAt = new Float64Array(total);
    const entities = plans.map(({ table }, t) => {
        const alive = [];
        for (let row = 0; row < table.count; row++) if (dropped[firsts[t] + row] === 0) alive.push(row);
        const reserved = new Float64Array(alive.length);
        reserveRun(state.entities, reserved);
        const spawned = new Float64Array(table.count);
        alive.forEach((row, i) => {
            spawned[row] = reserved[i];
            spawnedAt[firsts[t] + row] = reserved[i];
        });
        return spawned;
    });
    const isSpawned = (entity: number): boolean => {
        const at = positionOf(entity);
        return at >= 0 && dropped[at] === 0;
    };
    const remap: Remap = entity => isSpawned(entity) ? spawnedAt[positionOf(entity)] : 0;
    let droppedCount = 0;
    plans.forEach((plan, t) => {
        const { table, keys } = plan;
        const first = firsts[t];
        const weak = keys.filter(key => declarationOf(key)?.reference === "weak").map(key => ({ key, targetAt: referencesOf(Reflect.get(table.columns, key)) }));
        const loses = (row: number): boolean => weak.some(({ targetAt }) => {
            const target = targetAt(row);
            return target !== 0 && !isSpawned(target);
        });
        let whole = true;
        for (let row = 0; row < table.count && whole; row++) if (dropped[first + row] !== 0 || loses(row)) whole = false;
        if (whole) return spawnRows(state, plan, null, none, entities[t], remap);
        // Rows by the weak references they lose, whose targets aren't spawned: each set of components a batch of its own.
        const groups = new Map<string, { readonly removed: Set<Key>; readonly rows: number[] }>();
        for (let row = 0; row < table.count; row++) {
            if (dropped[first + row] !== 0) {
                droppedCount++;
                continue;
            }
            const removed = weak.filter(({ targetAt }) => {
                const target = targetAt(row);
                return target !== 0 && !isSpawned(target);
            }).map(({ key }) => key);
            const signature = removed.map(key => weak.findIndex(entry => entry.key === key)).join(",");
            let group = groups.get(signature);
            if (group === undefined) groups.set(signature, group = { removed: new Set(removed), rows: [] });
            group.rows.push(row);
        }
        for (const { removed, rows } of groups.values()) spawnRows(state, plan, rows, removed, Float64Array.from(rows, row => entities[t][row]), remap);
    });
    return { entities, dropped: droppedCount };
};
