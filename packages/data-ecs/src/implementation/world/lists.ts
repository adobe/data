import type { Entity } from '../../interface/entity/entity.js';
import { archetypeIndexOf, labelOf } from '../../interface/registry/index.js';
import { writeF32, writeF32Lanes, writeU32 } from './archetype.js';
import { batchOf, claim, openRow, writerOf, type Column, type SpawnBatch, type Writer } from './batches.js';
import { reserve } from './entities.js';
import { commandIdOf, type State } from './state.js';

/** Values by key, as spawns and adds read them. */
export type Values = { readonly [key: symbol]: unknown };

/** Spawns one entity of a list's components, writing its values into the list's batch. */
export type Spawner = (values: Values) => Entity;

/** Where a shape's spawns go: its batch, and the components holding values, each with its key, column and writer. */
export type Written = {
    readonly batch: SpawnBatch;
    readonly keys: readonly symbol[];
    readonly columns: readonly Column[];
    readonly writers: readonly Writer[];
};

/**
 * A set of components commands named, by their keys: keys and ids in the order of the list that first named them, what
 * each starts at when a spawn or add leaves it out, and, made on the first spawn, where spawns go and its spawner.
 */
export type ListShape = {
    /** Its index among the world's lists, by which commands name it. */
    readonly index: number;
    /** By source archetype id: the archetype an add or a remove of these components leaves, once a sync point resolved it. */
    readonly adding: number[];
    readonly removing: number[];
    readonly keys: readonly symbol[];
    readonly ids: readonly number[];
    readonly starts: readonly unknown[];
    written: Written | null;
    spawner: Spawner | null;
};

/** A plain list named recently, found by its keys, copied, since it may change. */
export type Recent = { readonly keys: readonly unknown[]; readonly shape: ListShape };

const recentCount = 8;

/** Resolves a list, checking each key is a component commands may name, listed once. Throws otherwise. */
const resolve = (state: State, list: readonly unknown[]): ListShape => {
    const ids = list.map(key => commandIdOf(state, key));
    for (let k = 1; k < ids.length; k++) {
        if (ids.indexOf(ids[k]) < k) throw new Error(`A list of components lists "${labelOf(list[k])}" twice.`);
    }
    const keys = list.filter(key => typeof key === "symbol");
    const name = [...ids].sort((a, b) => a - b).join(",");
    // Symbols a module evaluated again makes are the same components, but values are keyed by the caller's own.
    const shapes = state.lists.get(name) ?? [];
    const found = shapes.find(shape => keys.every(key => shape.keys.includes(key)));
    if (found !== undefined) return found;
    const shape: ListShape = { index: state.shapes.length, adding: [], removing: [], keys, ids, starts: ids.map(id => state.starts[id]), written: null, spawner: null };
    state.lists.set(name, [...shapes, shape]);
    state.shapes.push(shape);
    return shape;
};

/**
 * The shape of a list of components: an archetype `Archetype.create` indexed, which never changes, by its index; any
 * other list by its keys among the recent plain lists, else resolved and made recent. Lists of the same components in
 * any order share a shape.
 */
export const listShapeOf = (state: State, list: readonly unknown[]): ListShape => {
    const index = archetypeIndexOf(list);
    if (index >= 0) {
        const indexed = state.byIndex[index];
        if (indexed !== undefined) return indexed;
        const shape = resolve(state, list);
        state.byIndex[index] = shape;
        return shape;
    }
    const { recent } = state;
    const length = list.length;
    for (let r = 0; r < recent.length; r++) {
        const { keys } = recent[r];
        if (keys.length !== length) continue;
        let same = true;
        for (let k = 0; k < length && same; k++) same = keys[k] === list[k];
        if (same) return recent[r].shape;
    }
    const shape = resolve(state, list);
    const entry: Recent = { keys: [...list], shape };
    if (recent.length < recentCount) recent.push(entry);
    else recent[state.nextRecent = (state.nextRecent + 1) % recentCount] = entry;
    return shape;
};

/** Where a shape's spawns go, resolved once. A constant's column holds nothing, so nothing is written or read for it. */
export const writtenOf = (state: State, shape: ListShape): Written => {
    if (shape.written !== null) return shape.written;
    const batch = batchOf(state, shape.ids);
    const held = shape.ids.flatMap((id, k) => state.layouts[id].kind === "constant" ? [] : [k]);
    const columns = held.map(k => batch.columns[batch.ids.indexOf(shape.ids[k])]);
    shape.written = { batch, keys: held.map(k => shape.keys[k]), columns, writers: held.map((k, c) => writerOf(columns[c], shape.starts[k])) };
    return shape.written;
};

/** Spawns by reading each value by key in a loop: where code can't be generated. */
const loopSpawner = (state: State, { batch, keys, writers }: Written): Spawner => {
    const { entities } = state;
    const count = keys.length;
    return values => {
        const row = openRow(batch);
        for (let k = 0; k < count; k++) writers[k](row, values[keys[k]]);
        const entity = reserve(entities);
        claim(batch, entity);
        return entity;
    };
};

/** Whether code can be generated here; a content security policy without `'unsafe-eval'` forbids it. */
let generating = true;

/** Statements storing value expression `value` into column `k`: numbers and f32 tuples inline, anything else through its writer. */
const store = (column: Column, k: number, value: string): string => {
    const at = `row * ${column.unitStride} + ${column.unitOffset}`;
    switch (column.write) {
        case writeF32:
        case writeU32:
            return `v = ${value}; if (typeof v === "number") c${k}.views.${column.write === writeF32 ? "f32" : "u32"}[${at}] = v; else w${k}(row, v);`;
        case writeF32Lanes: {
            const lanes = Array.from({ length: column.lanes }, (_, lane) => `f[at + ${lane}] = Number(v[${lane}]);`).join(" ");
            return `v = ${value}; if (Array.isArray(v)) { const f = c${k}.views.f32; const at = ${at}; ${lanes} } else w${k}(row, v);`;
        }
        default:
            return `w${k}(row, ${value});`;
    }
};

/**
 * A function generated to spawn into `batch`, taking `parameters`: one straight-line store per column, of the value
 * expression `values[k]` gives, so each store sees one layout and each read one object shape. Only numbers are written
 * into the code: keys, columns and writers are its arguments. Null where code can't be generated.
 */
const generated = <F>(state: State, batch: SpawnBatch, parameters: readonly string[], keys: readonly symbol[], columns: readonly Column[], writers: readonly Writer[], values: (k: number) => string): F | null => {
    if (!generating) return null;
    const body = [
        `return (${parameters.join(", ")}) => {`, "const row = openRow(batch);", "let v;",
        ...columns.map((column, k) => store(column, k, values(k))),
        "const entity = reserve(entities);", "claim(batch, entity);", "return entity;", "};",
    ].join("\n");
    try {
        const factory = new Function("batch", "entities", "openRow", "claim", "reserve", ...columns.flatMap((_, k) => [`k${k}`, `c${k}`, `w${k}`]), body);
        // The factory returns the function its body above makes.
        const made: F = factory(batch, state.entities, openRow, claim, reserve, ...columns.flatMap((_, k) => [keys[k], columns[k], writers[k]]));
        return made;
    }
    catch {
        generating = false;
        return null;
    }
};

/** Spawns of a shape's components with their values in a site's key order, each `undefined` or left out its start. */
export type Positional = (...values: unknown[]) => Entity;

/**
 * Spawns of a shape taking values positionally in `order`, a site's key order: generated, else a loop over the
 * writers. A key the shape doesn't name is ignored.
 */
export const positionalOf = (state: State, shape: ListShape, order: readonly unknown[]): Positional => {
    const { batch, keys, columns, writers } = writtenOf(state, shape);
    const at = keys.map(key => order.indexOf(key));
    const made = generated<Positional>(state, batch, order.map((_, k) => `v${k}`), keys, columns, writers, k => at[k] < 0 ? "undefined" : `v${at[k]}`);
    if (made !== null) return made;
    const { entities } = state;
    return (...values) => {
        const row = openRow(batch);
        for (let k = 0; k < writers.length; k++) writers[k](row, at[k] < 0 ? undefined : values[at[k]]);
        const entity = reserve(entities);
        claim(batch, entity);
        return entity;
    };
};

/**
 * The spawner of a shape, made once: it writes each value it reads by key into the shape's batch, a tag or `undefined`
 * as the component's start, then reserves the entity, so a value that throws leaves nothing behind.
 */
export const spawnerOf = (state: State, shape: ListShape): Spawner => {
    if (shape.spawner !== null) return shape.spawner;
    const written = writtenOf(state, shape);
    const { batch, keys, columns, writers } = written;
    shape.spawner = generated<Spawner>(state, batch, ["values"], keys, columns, writers, k => `values[k${k}]`) ?? loopSpawner(state, written);
    return shape.spawner;
};
