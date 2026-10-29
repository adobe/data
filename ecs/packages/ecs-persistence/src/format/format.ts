// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component, Resource, Schema, World } from "@adobe/ecs";
import type { Failure } from "../failure.js";
import type { Contents } from "../program/contents.js";
import { programOf, type Persisted } from "../program/program.js";
import { fromJson, toJson } from "../values/values.js";

/**
 * The binary form of a snapshot, little-endian:
 * - 16 bytes: `ECSP`, the format's version as a u32, the header's length in bytes as a u32, and 4 bytes of zeros;
 * - the header, JSON text padded with spaces to a multiple of 8 bytes: each component and resource by name with its
 *   schema, and each table's count and where its entities and columns are;
 * - blocks, each starting at a multiple of 8 bytes: a table's entities as f64s, a column's bytes as its components'
 *   layout holds them, and a column of values as JSON text.
 * A loader views the blocks of bytes where they are, in the buffer it's given.
 */

const magic = [0x45, 0x43, 0x53, 0x50];
const version = 1;
const prefix = 16;

/** Where a column's data is. */
type ColumnJson =
    | { readonly kind: "bytes"; readonly offset: number; readonly length: number; readonly stride: number }
    | { readonly kind: "values"; readonly offset: number; readonly length: number }
    | { readonly kind: "value"; readonly value: unknown };

type Header = {
    readonly components: readonly { readonly name: string; readonly schema: Schema }[];
    readonly resources: readonly { readonly name: string; readonly schema: Schema; readonly value: unknown }[];
    readonly tables: readonly { readonly count: number; readonly entities: number; readonly columns: readonly ({ readonly component: number } & ColumnJson)[] }[];
};

const aligned = (offset: number): number => Math.ceil(offset / 8) * 8;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A snapshot's contents as bytes. */
export const encodeContents = (snapshot: Contents): Uint8Array => {
    const blocks: Uint8Array[] = [];
    let offset = 0;
    /** Places a block, returning its offset from the first block. */
    const place = (bytes: Uint8Array): number => {
        const at = offset;
        blocks.push(bytes);
        offset = aligned(offset + bytes.byteLength);
        return at;
    };
    const indexOf = new Map(snapshot.components.map((persisted, index) => [persisted.key, index]));
    const tables = snapshot.tables.map(table => {
        const entities = place(new Uint8Array(table.entities.buffer, table.entities.byteOffset, table.entities.byteLength));
        const columns = snapshot.components.flatMap((persisted): ({ readonly component: number } & ColumnJson)[] => {
            const key: symbol = persisted.key;
            const column: World.Table.Column | undefined = Reflect.get(table.columns, key);
            const component = indexOf.get(persisted.key) ?? -1;
            if (column === undefined) return [];
            if (column.kind === "bytes") return [{ component, kind: "bytes", offset: place(column.bytes), length: column.bytes.byteLength, stride: column.stride }];
            if (column.kind === "value") return [{ component, kind: "value", value: toJson(persisted.schema, column.value) }];
            const text = encoder.encode(JSON.stringify(column.values.map(value => toJson(persisted.schema, value))));
            return [{ component, kind: "values", offset: place(text), length: text.byteLength }];
        });
        return { count: table.count, entities, columns };
    });
    const header: Header = {
        components: snapshot.components.map(({ name, schema }) => ({ name, schema })),
        resources: snapshot.resources.map(({ persisted, value }) => ({ name: persisted.name, schema: persisted.schema, value: toJson(persisted.schema, value) })),
        tables,
    };
    const text = encoder.encode(JSON.stringify(header));
    const headerLength = aligned(text.byteLength);
    const bytes = new Uint8Array(prefix + headerLength + offset);
    bytes.set(magic, 0);
    const view = new DataView(bytes.buffer);
    view.setUint32(4, version, true);
    view.setUint32(8, headerLength, true);
    bytes.set(text, prefix);
    bytes.fill(0x20, prefix + text.byteLength, prefix + headerLength);
    let at = prefix + headerLength;
    for (const block of blocks) {
        bytes.set(block, at);
        at = aligned(at + block.byteLength);
    }
    return bytes;
};

const isObject = (value: unknown): value is object => typeof value === "object" && value !== null;

/** The header's JSON, checked enough to read it without casts, or null. */
const headerOf = (json: unknown): Header | null => {
    if (!isObject(json)) return null;
    const components: unknown = Reflect.get(json, "components");
    const resources: unknown = Reflect.get(json, "resources");
    const tables: unknown = Reflect.get(json, "tables");
    if (!Array.isArray(components) || !Array.isArray(resources) || !Array.isArray(tables)) return null;
    const named = (item: unknown): boolean => isObject(item) && typeof Reflect.get(item, "name") === "string" && isObject(Reflect.get(item, "schema"));
    if (!components.every(named) || !resources.every(named)) return null;
    const isColumn = (item: unknown): boolean => {
        if (!isObject(item) || typeof Reflect.get(item, "component") !== "number") return false;
        const kind: unknown = Reflect.get(item, "kind");
        if (kind === "value") return true;
        const numbers = kind === "bytes" ? ["offset", "length", "stride"] : kind === "values" ? ["offset", "length"] : null;
        return numbers !== null && numbers.every(name => typeof Reflect.get(item, name) === "number");
    };
    const isTable = (item: unknown): boolean => {
        if (!isObject(item) || typeof Reflect.get(item, "count") !== "number" || typeof Reflect.get(item, "entities") !== "number") return false;
        const columns: unknown = Reflect.get(item, "columns");
        return Array.isArray(columns) && columns.every(isColumn);
    };
    if (!tables.every(isTable)) return null;
    // Checked above: each item has the fields the header's type names, of their types.
    const header = json as Header;
    return header;
};

/** Whether two schemas are the same, by their JSON in their properties' order, which places a struct's fields. */
const sameSchema = (a: Schema, b: Schema): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * The snapshot contents `bytes` holds, its components and resources by name as this program persists them, its blocks of
 * bytes viewed where they are; or why it can't be read: it isn't one, or names what this program doesn't persist, or
 * persists with another schema.
 */
export const decodeContents = (bytes: Uint8Array): Contents | Failure => {
    if (bytes.byteLength < prefix || magic.some((byte, at) => bytes[at] !== byte)) return { failure: "These bytes aren't a snapshot." };
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const found = view.getUint32(4, true);
    if (found !== version) return { failure: `This snapshot's format is version ${found}; this package reads version ${version}.` };
    const headerLength = view.getUint32(8, true);
    let json: unknown;
    try {
        json = JSON.parse(decoder.decode(bytes.subarray(prefix, prefix + headerLength)));
    }
    catch {
        return { failure: "This snapshot's header isn't JSON." };
    }
    const header = headerOf(json);
    if (header === null) return { failure: "This snapshot's header isn't one this package writes." };
    const program = programOf();
    if (typeof program === "string") return { failure: program };
    const components: Persisted<Component.Key>[] = [];
    for (const { name, schema } of header.components) {
        const persisted = program.components.get(name);
        if (persisted === undefined) return { failure: `This snapshot holds component "${name}", which this program doesn't persist.` };
        if (!sameSchema(persisted.schema, schema)) return { failure: `Component "${name}" has another schema here than in this snapshot.` };
        components.push(persisted);
    }
    const resources: { persisted: Persisted<Resource.Key>; value: unknown }[] = [];
    for (const { name, schema, value } of header.resources) {
        const persisted = program.resources.get(name);
        if (persisted === undefined) return { failure: `This snapshot holds resource "${name}", which this program doesn't persist.` };
        if (!sameSchema(persisted.schema, schema)) return { failure: `Resource "${name}" has another schema here than in this snapshot.` };
        resources.push({ persisted, value: fromJson(schema, value) });
    }
    // Blocks are 8-byte aligned in the buffer the format was written to; one given at another offset is copied once.
    const blocks = (bytes.byteOffset + prefix + headerLength) % 8 === 0 ? bytes : bytes.slice();
    const base = blocks.byteOffset + prefix + headerLength;
    const end = blocks.byteOffset + blocks.byteLength;
    const inBounds = (offset: number, length: number): boolean => offset >= 0 && length >= 0 && base + offset + length <= end;
    const tables: World.Table[] = [];
    for (const table of header.tables) {
        if (!inBounds(table.entities, table.count * 8)) return { failure: "This snapshot's blocks are cut short." };
        const columns: { [key: symbol]: World.Table.Column } = {};
        for (const column of table.columns) {
            const persisted = components[column.component];
            if (persisted === undefined) return { failure: "This snapshot names a component it doesn't hold." };
            if (column.kind === "value") columns[persisted.key] = { kind: "value", value: fromJson(persisted.schema, column.value) };
            else if (!inBounds(column.offset, column.length)) return { failure: "This snapshot's blocks are cut short." };
            else if (column.kind === "bytes") columns[persisted.key] = { kind: "bytes", bytes: new Uint8Array(blocks.buffer, base + column.offset, column.length), stride: column.stride };
            else {
                let values: unknown;
                try {
                    values = JSON.parse(decoder.decode(new Uint8Array(blocks.buffer, base + column.offset, column.length)));
                }
                catch {
                    return { failure: `Component "${persisted.name}"'s values in this snapshot aren't JSON.` };
                }
                if (!Array.isArray(values)) return { failure: `Component "${persisted.name}"'s values in this snapshot aren't a list.` };
                columns[persisted.key] = { kind: "values", values: values.map(value => fromJson(persisted.schema, value)) };
            }
        }
        tables.push({ count: table.count, entities: new Float64Array(blocks.buffer, base + table.entities, table.count), columns });
    }
    return { components, tables, resources };
};
