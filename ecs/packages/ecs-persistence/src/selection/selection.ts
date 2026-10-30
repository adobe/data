// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Component, System, type Entity, type Resource, type World } from "@adobe/ecs";
import type { Failure } from "../failure.js";
import type { Contents } from "../program/contents.js";
import type { Program } from "../program/program.js";

/**
 * Which entities a snapshot takes: those matching `with` and `not`, every one holding a persisted component by
 * default; or `root` and every entity it owns, directly or through others, by persisted owner references.
 */
export type Selection =
    | { readonly with?: readonly Component.Key[]; readonly not?: readonly Component.Key[]; readonly resources?: boolean }
    | { readonly root: Entity };

/** Which tables a snapshot reads: those of its persisted components, matching `with` and `not`, and its resources. */
type Reading = {
    readonly components: readonly Component.Key[];
    readonly with?: readonly Component.Key[];
    readonly not?: readonly Component.Key[];
    readonly resources?: readonly Resource.Key[];
};

/** A readonly system reading the tables `declaration` names. */
const tablesSystemOf = (declaration: Reading) =>
    System.create({ readonly: true, tables: declaration }, ({ tables }) => tables);

/** The rows of `table` whose entities `keep` takes, as a table of their own. */
const rowsOf = (table: World.Table, keep: (entity: number) => boolean): World.Table | null => {
    const rows: number[] = [];
    for (let row = 0; row < table.count; row++) if (keep(table.entities[row])) rows.push(row);
    if (rows.length === table.count) return table;
    if (rows.length === 0) return null;
    const columns: { [key: symbol]: World.Table.Column } = {};
    for (const key of Object.getOwnPropertySymbols(table.columns)) {
        const column: World.Table.Column | undefined = Reflect.get(table.columns, key);
        if (column === undefined) continue;
        if (column.kind === "value") columns[key] = column;
        else if (column.kind === "values") columns[key] = { kind: "values", values: rows.map(row => column.values[row]) };
        else {
            const { stride } = column;
            const bytes = new Uint8Array(rows.length * stride);
            rows.forEach((row, at) => bytes.set(column.bytes.subarray(row * stride, (row + 1) * stride), at * stride));
            columns[key] = { kind: "bytes", bytes, stride };
        }
    }
    return { count: rows.length, entities: Float64Array.from(rows, row => table.entities[row]), columns };
};

/** The entities `root` owns, itself included, through the owner references among `owners` in the tables. */
const subtreeOf = (tables: readonly World.Table[], owners: readonly Component.Key[], root: Entity): ReadonlySet<number> => {
    const children = new Map<number, number[]>();
    for (const table of tables) {
        for (const reference of owners) {
            const key: symbol = reference;
            const column: World.Table.Column | undefined = Reflect.get(table.columns, key);
            if (column?.kind !== "bytes") continue;
            const view = new DataView(column.bytes.buffer, column.bytes.byteOffset, column.bytes.byteLength);
            for (let row = 0; row < table.count; row++) {
                const owner = view.getFloat64(row * column.stride, true);
                const list = children.get(owner);
                if (list === undefined) children.set(owner, [table.entities[row]]);
                else list.push(table.entities[row]);
            }
        }
    }
    const taken = new Set<number>([root]);
    const waiting: number[] = [root];
    for (let next = waiting.pop(); next !== undefined; next = waiting.pop()) {
        for (const child of children.get(next) ?? []) {
            if (taken.has(child)) continue;
            taken.add(child);
            waiting.push(child);
        }
    }
    return taken;
};

/** The persisted part of the entities `selection` takes from `world`, on its thread, or why it can't be read. */
export const select = async (world: World, program: Program, selection: Selection): Promise<Contents | Failure> => {
    const components = [...program.components.values()];
    const keys = components.map(persisted => persisted.key);
    const subtree = "root" in selection;
    const resources = subtree || selection.resources === false ? [] : [...program.resources.values()];
    const declaration: Reading = subtree
        ? { components: keys }
        : { components: keys, with: selection.with ?? [], not: selection.not ?? [], resources: resources.map(persisted => persisted.key) };
    const read = await world.run(tablesSystemOf(declaration)).catch((error: unknown) => ({ failure: error instanceof Error ? error.message : String(error) }));
    if ("failure" in read) return read;
    let tables = read.archetypes;
    if (subtree) {
        const owners = keys.filter(key => Component.declarations().get(key)?.reference === "owner");
        const taken = subtreeOf(tables, owners, selection.root);
        tables = tables.flatMap(table => rowsOf(table, entity => taken.has(entity)) ?? []);
    }
    return { components, tables, resources: resources.map(persisted => ({ persisted, value: read.resources[persisted.key] })) };
};
