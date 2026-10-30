// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index, System, type Component, type Schema, type World } from "@adobe/ecs";
import type { Failure } from "../failure.js";
import type { Contents } from "../program/contents.js";
import { toJson } from "../values/values.js";

/** An index whose entities are the same in two worlds where their keys are: a unique one. */
export type Matching = Index<{ readonly unique: true }>;

/** What a match reads of a world: the tables of the entities an index holds, with its key's columns. */
const keysSystemOf = (declaration: Index.Declared) => System.create({
    readonly: true,
    tables: { components: declaration.key, with: [...declaration.key, ...declaration.components.with ?? []], not: declaration.components.not ?? [] },
}, ({ tables }) => tables.archetypes);

/** Bytes as text, a character each, so equal bytes give equal text and a row's are a slice of its column's. */
const bytesDecoder = new TextDecoder("latin1");

/**
 * Each row's key in a table, as text, or null for a table without a column of each part: each part's column, its bytes
 * in the world's layout, which two worlds of one program share, or its value as JSON by its schema. Equal keys give
 * equal text.
 */
const keysOf = (table: World.Table, parts: readonly { readonly key: Component.Key; readonly schema: Schema }[]): ((row: number) => string) | null => {
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
 * Each of the snapshot's entities that `indexes` say is the same as one of `world`'s, to that one: an index holds both,
 * with equal keys. Fails, as data, for an index whose key a component the snapshot doesn't persist is part of, or two
 * of the snapshot's entities one index holds with one key.
 */
export const existingFor = async (world: World, from: Contents, indexes: readonly Matching[]): Promise<ReadonlyMap<number, number> | Failure> => {
    const existing = new Map<number, number>();
    const persisted = new Map(from.components.map(item => [item.key, item]));
    for (const index of indexes) {
        const declaration = Index.declarationOf(index);
        if (declaration === undefined) return { failure: `${index.name} isn't an index.` };
        const parts: { readonly key: Component.Key; readonly schema: Schema }[] = [];
        for (const key of declaration.key) {
            const found = persisted.get(key);
            if (found === undefined) return { failure: `Index "${index.name}" can't match: a part of its key isn't persisted, so the snapshot holds no key for it.` };
            parts.push({ key, schema: found.schema });
        }
        const saved = new Map<string, number>();
        for (const table of from.tables) {
            if (!covers(table, declaration)) continue;
            const keyAt = keysOf(table, parts);
            if (keyAt === null) continue;
            for (let row = 0; row < table.count; row++) {
                const key = keyAt(row);
                if (saved.has(key)) return { failure: `Index "${index.name}" can't match: two of the snapshot's entities have one key.` };
                saved.set(key, table.entities[row]);
            }
        }
        if (saved.size === 0) continue;
        const read = await world.run(keysSystemOf(declaration)).catch((error: unknown) => ({ failure: error instanceof Error ? error.message : String(error) }));
        if ("failure" in read) return read;
        for (const table of read) {
            const keyAt = keysOf(table, parts);
            if (keyAt === null) continue;
            for (let row = 0; row < table.count; row++) {
                const entity = saved.get(keyAt(row));
                if (entity === undefined) continue;
                // Two of the world's entities with one key: the one with the lower entity index, as its unique index keeps.
                const kept = existing.get(entity);
                if (kept === undefined || (table.entities[row] >>> 0) < (kept >>> 0)) existing.set(entity, table.entities[row]);
            }
        }
    }
    return existing;
};
