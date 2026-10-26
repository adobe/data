// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from '../../interface/entity/entity.js';
import { archetypeIndexKey, internArchetype, labelOf, type Interned } from '../../interface/registry/index.js';
import { batchOf } from './batches.js';
import { reserve } from './entities.js';
import { claim, encodedIn, generated, noValues, openRow, writerOf, type Column, type Positional, type SpawnBatch, type Writer } from './staging.js';
import { cacheShared, exactTextOf, internShared, type SharedValues } from './shared.js';
import { commandIdOf, type State } from './state.js';

/** Values by key, as spawns and adds read them. */
export type Values = { readonly [key: symbol]: unknown };

/** Spawns one entity of a list's components, writing its values into the list's batch. */
export type Spawner = (values?: Values) => Entity;

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
    /** The positions of its shared components, whose values a spawner of it takes first. */
    readonly shared: readonly number[];
    written: Written | null;
    spawner: Spawner | null;
    /** Its spawners with constants, by their values (`presetSpawnerOf`). */
    presets: PresetNode | null;
};

/**
 * A level of a shape's spawners with constants: by the constant of the next component in the shape's order, the next
 * level, the last one holding the spawner. A shared value is keyed by its number, a primitive by itself, other data
 * by its text, and anything else by identity.
 */
type PresetNode = { readonly next: Map<unknown, PresetNode>; spawner: Spawner | null; letGo: (() => void) | null };

/** A plain list named recently, found by its keys, copied once for its shape, since it may change. */
export type Recent = { keys: readonly unknown[]; shape: ListShape };

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
    const shared = ids.flatMap((id, k) => state.shared[id] === undefined ? [] : [k]);
    const shape: ListShape = { index: state.shapes.length, adding: [], removing: [], keys, ids, starts: ids.map(id => state.starts[id]), shared, written: null, spawner: null, presets: null };
    state.lists.set(name, [...shapes, shape]);
    state.shapes.push(shape);
    return shape;
};

/**
 * The index a list has: the program-wide one the plugin gave it, which never changes; for one made at runtime, the
 * one it keeps while its keys are those it was resolved with; else -1. Both are read from one property, so a list of
 * either kind is one lookup.
 */
export const listIndexOf = (list: readonly unknown[]): number => {
    const index: unknown = Reflect.get(list, archetypeIndexKey);
    return typeof index === "number" ? index : isKept(index) && sameKeys(index.keys, list) ? index.index : -1;
};

/**
 * The shape of a list of components, by its index (`listIndexOf`); for a list made at runtime without one, by its keys
 * among the recent ones, else resolved, given an index it keeps and made recent. Lists of the same components in any
 * order share a shape.
 */
export const listShapeOf = (state: State, list: readonly unknown[]): ListShape => {
    const index = listIndexOf(list);
    return (index >= 0 ? state.byIndex[index] : undefined) ?? shapeOfList(state, list, index);
};

/** A list's shape, other than one already resolved by its index. */
const shapeOfList = (state: State, list: readonly unknown[], index: number): ListShape => {
    if (index >= 0) {
        const shape = resolve(state, list);
        state.byIndex[index] = shape;
        return shape;
    }
    const { recent } = state;
    for (let r = 0; r < recent.length; r++) if (sameKeys(recent[r].keys, list)) return recent[r].shape;
    // Lists of these keys made on every call share one index, so a shape seen before allocates nothing here.
    const interned = internArchetype(list);
    const shape = state.byIndex[interned.index] ?? (state.byIndex[interned.index] = resolve(state, list));
    if (recent.length < recentCount) recent.push({ keys: interned.keys, shape });
    else {
        const slot = recent[state.nextRecent = (state.nextRecent + 1) % recentCount];
        slot.keys = interned.keys;
        slot.shape = shape;
    }
    // A list keeps the record of its keys' index, so naming it again is one lookup while it holds them.
    const kept: unknown = Reflect.get(list, archetypeIndexKey);
    if (kept === undefined && Object.isExtensible(list)) {
        record.value = interned;
        Object.defineProperty(list, archetypeIndexKey, record);
    }
    else if (isKept(kept)) Reflect.set(list, archetypeIndexKey, interned);
    return shape;
};

/** The descriptor a list's record is defined by, its value set for each: writable, since the list may change. */
const record: PropertyDescriptor = { value: null, writable: true };

/** Whether an index property holds a list's record: only this module puts an object there, and indexes are numbers. */
const isKept = (value: unknown): value is Interned => typeof value === "object" && value !== null;

/** Whether a list holds exactly the keys copied from one before. */
const sameKeys = (keys: readonly unknown[], list: readonly unknown[]): boolean => {
    const length = list.length;
    if (keys.length !== length) return false;
    for (let k = 0; k < length; k++) if (keys[k] !== list[k]) return false;
    return true;
};

/** Where a shape's spawns go, resolved once. A constant's column holds nothing, so nothing is written or read for it. */
export const writtenOf = (state: State, shape: ListShape): Written => {
    if (shape.written !== null) return shape.written;
    shape.written = writtenInto(state, shape, batchOf(state, shape.ids));
    return shape.written;
};

/** Where a shape's spawns into `batch` go: its columns holding values, each with its key and writer. */
const writtenInto = (state: State, shape: ListShape, batch: SpawnBatch): Written => {
    const held = shape.ids.flatMap((id, k) => state.layouts[id].kind === "constant" ? [] : [k]);
    const columns = held.map(k => batch.columns[batch.ids.indexOf(shape.ids[k])]);
    return { batch, keys: held.map(k => shape.keys[k]), columns, writers: held.map((k, c) => writerOf(columns[c], shape.starts[k])) };
};

/** Throws for a spawner without constants of a shape with shared components, whose values choose the archetype. */
const refuseShared = (shape: ListShape): void => {
    const first = shape.shared[0];
    if (first !== undefined) throw new Error(`A spawn of "${labelOf(shape.keys[first])}", a shared component, takes its value first: commands.spawn(components, { [key]: value }).`);
};

/** Spawns by reading each value by key in a loop: where code can't be generated. */
const loopSpawner = (state: State, { batch, keys, writers }: Written): Spawner => {
    const { entities } = state;
    const count = keys.length;
    return (values = noValues) => {
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
    refuseShared(shape);
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
    refuseShared(shape);
    const written = writtenOf(state, shape);
    const { batch, keys, columns, writers } = written;
    shape.spawner = generated<Spawner>(state.entities, reserve, batch, ["values = none"], keys, columns, writers, k => `values[k${k}]`) ?? loopSpawner(state, written);
    return shape.spawner;
};

/** For tests of what a world holds: the levels of a shape's spawners with constants. */
export const presetLevelsOf = (shape: ListShape): number => {
    const count = (node: PresetNode): number => {
        let levels = 0;
        for (const child of node.next.values()) levels += 1 + count(child);
        return levels;
    };
    return shape.presets === null ? 0 : count(shape.presets);
};

/** What keys a component given no constant at its level of a shape's spawners. */
const absent = Symbol("absent");
/** What keys a constant of -0, which a map's keys don't tell from 0. */
const negativeZero = Symbol("negativeZero");

/**
 * The spawner of a shape with constants `preset`: the same function for a world, list and equal constants each time,
 * found by each constant in turn, a level of the shape's spawners each (`PresetNode`). Its batch is the one of the
 * shape's components and shared values, so its archetype, found by them, is resolved when the spawner is made, and
 * made with the first sync point that commits a spawn of it. Every shared component is given a value of its type here,
 * or the spawner throws. Other constants are encoded once and copied into each spawn; its call reads only the rest.
 */
export const presetSpawnerOf = (state: State, shape: ListShape, preset: object): Spawner => {
    let node = shape.presets ??= { next: new Map(), spawner: null, letGo: null };
    const { keys, ids } = shape;
    for (let k = 0; k < keys.length; k++) {
        const given: unknown = Reflect.get(preset, keys[k]);
        const values = state.shared[ids[k]];
        let part: unknown;
        if (values !== undefined) {
            if (given === undefined) throw new Error(`A spawn of "${labelOf(keys[k])}", a shared component, takes its value first: commands.spawn(components, { [key]: value }).`);
            part = internShared(values, given);
            if (part === -1) throw new Error(`"${labelOf(keys[k])}" isn't given one of its type's values: ${labelOf(given)}.`);
        }
        else part = given === undefined ? absent : Object.is(given, -0) ? negativeZero : typeof given === "object" && given !== null ? exactTextOf(given) ?? given : given;
        let next = node.next.get(part);
        if (next === undefined) {
            next = { next: new Map(), spawner: null, letGo: null };
            node.next.set(part, next);
            if (values !== undefined && typeof part === "number") letGoWith(values, part, node, next);
        }
        node = next;
    }
    return node.spawner ??= makePresetSpawner(state, shape, preset);
};

/** Throws for a spawn giving a component its constants gave. */
const refuseGiven = (key: unknown): never => {
    throw new Error(`A spawn gives "${labelOf(key)}" in both its calls: each component's value comes from one.`);
};

/**
 * Lets go of a level of a shape's spawners found by shared value `number`, under `parent`, once that value is dropped,
 * so levels don't pile up as values come and go: the levels below it let go of what they registered too.
 */
const letGoWith = (values: SharedValues, number: number, parent: PresetNode, node: PresetNode): void => {
    node.letGo = cacheShared(values, number, () => {
        if (parent.next.get(number) === node) parent.next.delete(number);
        unregisterBelow(node);
    });
};

/** Unregisters every level below `node` from the values that would drop it, as `node` is dropped itself. */
const unregisterBelow = (node: PresetNode): void => {
    for (const child of node.next.values()) {
        child.letGo?.();
        unregisterBelow(child);
    }
};

/** Makes the spawner of a shape with constants, the first time those constants are given. */
const makePresetSpawner = (state: State, shape: ListShape, preset: object): Spawner => {
    const shared: (number | undefined)[] = [];
    for (const k of shape.shared) {
        const values = state.shared[shape.ids[k]];
        if (values !== undefined) shared[shape.ids[k]] = internShared(values, Reflect.get(preset, shape.keys[k]));
    }
    const written = writtenInto(state, shape, batchOf(state, shape.ids, shared));
    const { batch, keys, columns, writers } = written;
    const constants = keys.map(key => Reflect.get(preset, key));
    const encoded = columns.map((column, c) => constants[c] === undefined ? null : encodedIn(column, constants[c]));
    // Every key the constants give, shared ones included, which a spawn's values mustn't give again.
    const given = shape.keys.filter(key => Reflect.get(preset, key) !== undefined);
    const guarded = { keys: given, refuse: refuseGiven };
    const made = generated<Spawner>(state.entities, reserve, batch, ["values = none"], keys.map((key, c) => constants[c] === undefined ? key : constants[c]), columns, writers, k => constants[k] === undefined ? `values[k${k}]` : `k${k}`, encoded, guarded);
    if (made !== null) return made;
    const { entities } = state;
    return (values = noValues) => {
        for (const key of given) if (values[key] !== undefined) refuseGiven(key);
        const row = openRow(batch);
        for (let k = 0; k < keys.length; k++) writers[k](row, constants[k] === undefined ? values[keys[k]] : constants[k]);
        const entity = reserve(entities);
        claim(batch, entity);
        return entity;
    };
};
