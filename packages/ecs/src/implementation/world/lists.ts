import type { Entity } from '../../interface/entity/entity.js';
import { archetypeIndexOf, labelOf } from '../../interface/registry/index.js';
import { batchOf } from './batches.js';
import { reserve } from './entities.js';
import { claim, generated, openRow, writerOf, type Column, type Positional, type SpawnBatch, type Writer } from './staging.js';
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
    // Kept small, so it inlines into the systems spawning and adding: the rest is outlined.
    return (index >= 0 ? state.byIndex[index] : undefined) ?? shapeOfList(state, list, index);
};

/** A list's shape, other than an archetype's already resolved. */
const shapeOfList = (state: State, list: readonly unknown[], index: number): ListShape => {
    if (index >= 0) {
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

export type { Positional };

/**
 * Spawns of a shape taking values positionally in `order`, a site's key order: generated, else a loop over the
 * writers. A key the shape doesn't name is ignored.
 */
export const positionalOf = (state: State, shape: ListShape, order: readonly unknown[]): Positional => {
    const { batch, keys, columns, writers } = writtenOf(state, shape);
    const at = keys.map(key => order.indexOf(key));
    const made = generated<Positional>(state.entities, reserve, batch, order.map((_, k) => `v${k}`), keys, columns, writers, k => at[k] < 0 ? "undefined" : `v${at[k]}`);
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
export const spawnerOf = (state: State, shape: ListShape): Spawner => shape.spawner ?? makeSpawner(state, shape);

/** Makes a shape's spawner, the first time it spawns. */
const makeSpawner = (state: State, shape: ListShape): Spawner => {
    const written = writtenOf(state, shape);
    const { batch, keys, columns, writers } = written;
    shape.spawner = generated<Spawner>(state.entities, reserve, batch, ["values"], keys, columns, writers, k => `values[k${k}]`) ?? loopSpawner(state, written);
    return shape.spawner;
};
