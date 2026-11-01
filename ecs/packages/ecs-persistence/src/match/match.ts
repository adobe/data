// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index, System, type Component, type Schema, type World } from "@adobe/ecs";
import type { Failure } from "../failure.js";
import type { Contents } from "../program/contents.js";
import { toJson } from "../values/values.js";
import { addKey, addKeyColumns, createKeyTable, findKey, type KeyColumns } from "./keys.js";

/** An index whose entities are the same in two worlds where their keys are: a unique one. */
export type Matching = Index<{ readonly unique: true }>;

/** What a match reads of a world: the tables of the entities an index holds, with its key's columns. */
const keysSystemOf = (declaration: Index.Declared) => System.create({
    readonly: true,
    tables: { components: declaration.key, with: [...declaration.key, ...declaration.components.with ?? []], not: declaration.components.not ?? [] },
}, ({ tables }) => tables.archetypes);

/** A part of an index's key: its component, and that component's schema as the snapshot holds it. */
type Part = { readonly key: Component.Key; readonly schema: Schema };

/** Bytes as text, a character each, so equal bytes give equal text and a row's are a slice of its column's. */
const bytesDecoder = new TextDecoder("latin1");

/**
 * Each row's key in a table, as text, or null for a table without a column of each part: each part's column, its bytes
 * in the world's layout, which two worlds of one program share, or its value as JSON by its schema. Equal keys give
 * equal text.
 */
const keysOf = (table: World.Table, parts: readonly Part[]): ((row: number) => string) | null => {
    const columns: ((row: number) => string)[] = [];
    for (const { key, schema } of parts) {
        const column = table.columns[key];
        if (column === undefined) return null;
        if (column.kind === "bytes") {
            const text = bytesDecoder.decode(column.bytes);
            const { stride } = column;
            columns.push(row => text.slice(row * stride, (row + 1) * stride));
        }
        else if (column.kind === "values") columns.push(row => JSON.stringify(toJson(schema, column.values[row])));
        else {
            const text = JSON.stringify(toJson(schema, column.value));
            columns.push(() => text);
        }
    }
    const [only] = columns;
    return columns.length === 1 && only !== undefined ? only : row => columns.map(part => part(row)).join("\u0000");
};

/** Whether a table holds the entities an index holds: every key part and `with` component, and none in `not`. */
const covers = (table: World.Table, declaration: Index.Declared): boolean =>
    [...declaration.key, ...declaration.components.with ?? []].every(key => table.columns[key] !== undefined)
    && (declaration.components.not ?? []).every(key => table.columns[key] === undefined);

/**
 * Adds to `existing` each of the snapshot's entities an index holds, to the world's with its key, or fails, as data,
 * for two of the snapshot's with one key; `name` is the index's.
 */
type Matched = (name: string, existing: Map<number, number>) => Promise<Failure | undefined>;

const twoWithOneKey = (name: string): Failure => ({ failure: `Index "${name}" can't match: two of the snapshot's entities have one key.` });

const readWorld = (world: World, declaration: Index.Declared): Promise<readonly World.Table[] | Failure> =>
    world.run(keysSystemOf(declaration)).catch((error: unknown) => ({ failure: error instanceof Error ? error.message : String(error) }));

/** Two of the world's entities with one key: the one with the lower entity index, as its unique index keeps. */
const keep = (existing: Map<number, number>, entity: number, candidate: number): void => {
    const kept = existing.get(entity);
    if (kept === undefined || (candidate >>> 0) < (kept >>> 0)) existing.set(entity, candidate);
};

/** A table's columns of each part, or null for one without a column of bytes for each. */
const bytesOf = (table: World.Table, parts: readonly Part[]): KeyColumns | null => {
    const columns: KeyColumns[number][] = [];
    for (const { key } of parts) {
        const column = table.columns[key];
        if (column === undefined || column.kind !== "bytes") return null;
        columns.push(column);
    }
    return columns;
};

/**
 * Matches by the bytes of keys' columns, without making text of them, when every table of the snapshot holding the
 * index's entities has columns of bytes for its key; null otherwise. The world's tables, of the same program, then do too.
 */
const matchBytes = (world: World, from: Contents, declaration: Index.Declared, parts: readonly Part[]): Matched | null => {
    const tables = from.tables.filter(table => covers(table, declaration));
    const columns = tables.map(table => bytesOf(table, parts));
    if (columns.some(item => item === null)) return null;
    return async (name, existing) => {
        const saved = createKeyTable(tables.reduce((sum, table) => sum + table.count, 0));
        for (let t = 0; t < tables.length; t++) {
            const keys = columns[t];
            if (keys === null) continue;
            addKeyColumns(saved, keys);
            const { entities, count } = tables[t];
            for (let row = 0; row < count; row++) if (!addKey(saved, row, entities[row])) return twoWithOneKey(name);
        }
        if (saved.count === 0) return undefined;
        const read = await readWorld(world, declaration);
        if ("failure" in read) return read;
        for (const table of read) {
            const keys = bytesOf(table, parts);
            if (keys === null) continue;
            for (let row = 0, entry = -1; row < table.count; row++) {
                entry = findKey(saved, keys, row, entry + 1);
                if (entry >= 0) keep(existing, saved.values[entry], table.entities[row]);
            }
        }
        return undefined;
    };
};

/** Matches by keys as text, which any column gives. */
const matchText = (world: World, from: Contents, declaration: Index.Declared, parts: readonly Part[]): Matched => async (name, existing) => {
    const saved = new Map<string, number>();
    for (const table of from.tables) {
        if (!covers(table, declaration)) continue;
        const keyAt = keysOf(table, parts);
        if (keyAt === null) continue;
        for (let row = 0; row < table.count; row++) {
            const key = keyAt(row);
            if (saved.has(key)) return twoWithOneKey(name);
            saved.set(key, table.entities[row]);
        }
    }
    if (saved.size === 0) return undefined;
    const read = await readWorld(world, declaration);
    if ("failure" in read) return read;
    for (const table of read) {
        const keyAt = keysOf(table, parts);
        if (keyAt === null) continue;
        for (let row = 0; row < table.count; row++) {
            const entity = saved.get(keyAt(row));
            if (entity !== undefined) keep(existing, entity, table.entities[row]);
        }
    }
    return undefined;
};

/**
 * Each of the snapshot's entities that `indexes` say is the same as one of `world`'s, to that one: an index holds both,
 * with equal keys. Fails, as data, for an index whose key, `with` or `not` names a component the snapshot's trait doesn't
 * cover, or two of the snapshot's entities one index holds with one key.
 */
export const existingFor = async (world: World, from: Contents, indexes: readonly Matching[]): Promise<ReadonlyMap<number, number> | Failure> => {
    const existing = new Map<number, number>();
    const persisted = new Map(from.components.map(item => [item.key, item]));
    for (const index of indexes) {
        const declaration = Index.declarationOf(index);
        if (declaration === undefined) return { failure: `${index.name} isn't an index.` };
        const parts: Part[] = [];
        for (const key of declaration.key) {
            const found = persisted.get(key);
            if (found === undefined) return { failure: `Index "${index.name}" can't match: a part of its key isn't one the snapshot's trait covers, so the snapshot holds no key for it.` };
            parts.push({ key, schema: found.schema });
        }
        if ([...declaration.components.with ?? [], ...declaration.components.not ?? []].some(key => !persisted.has(key))) {
            return { failure: `Index "${index.name}" can't match: its with or not names a component the snapshot's trait doesn't cover, so the snapshot can't tell which of its entities the index holds.` };
        }
        const matched = matchBytes(world, from, declaration, parts) ?? matchText(world, from, declaration, parts);
        const found = await matched(index.name, existing);
        if (found !== undefined) return found;
    }
    return existing;
};
