// © 2026 Adobe. MIT License. See /LICENSE for details.
import { labelOf } from '../../interface/registry/names.js';
import type { Tables, TablesDeclaration } from '../../interface/system/tables.js';
import type { Table } from '../../interface/world/table/table.js';
import type { Archetype, Storage } from './archetype.js';
import { readCell } from './cells.js';
import { resourceCell } from './resources.js';
import { idOf, type Key, type State } from './state.js';
import { holdsValuesOf } from './where.js';

// Reading tables, apart from spawning them: rows' contexts import it, and what spawning imports would make a cycle.

/** Why a table can't read a joined thread's object `id`: it gave no values, or said why. */
const ungathered = (state: State, key: Key, id: number): Error =>
    new Error(`Tables can't read "${labelOf(key)}": a joined thread fills its objects${state.gathered?.errors.has(id) === true ? `, and gave none: ${state.gathered.errors.get(id)}` : ", and gave none"}.`);

/** What an archetype's storage of a component gives a table: a copy of its rows `0` to `count`. */
const columnOf = (state: State, key: Key, id: number, archetype: Archetype, storage: Storage, count: number): Table.Column => {
    const { layout } = storage;
    switch (layout.kind) {
        case "linear": return { kind: "bytes", bytes: storage.views.u8.slice(0, count * layout.stride), stride: layout.stride };
        case "constant": return { kind: "value", value: layout.value };
        case "object":
            if (storage.remote === null) return { kind: "values", values: storage.values.slice(0, count) };
            return { kind: "values", values: gatheredColumn(state, key, id, archetype.entities, count) };
        case "string": {
            const values: unknown[] = new Array(count);
            for (let row = 0; row < count; row++) values[row] = readCell(storage, row);
            return { kind: "values", values };
        }
    }
};

/** A joined thread's values of its object `id` for each of `entities`, as it gave them; its start for one it didn't. */
const gatheredColumn = (state: State, key: Key, id: number, entities: Float64Array, count: number): unknown[] => {
    const byEntity = state.gathered?.components.get(id);
    if (byEntity === undefined) throw ungathered(state, key, id);
    const start = state.starts[id];
    const values: unknown[] = new Array(count);
    for (let row = 0; row < count; row++) values[row] = byEntity.has(entities[row]) ? byEntity.get(entities[row]) : start;
    return values;
};

/**
 * A readonly system's `tables`, read by the function this returns, once per read: of each archetype matching `with`,
 * `not` and `where` and holding any of `components`, its entities and a copy of the column of each of them it holds;
 * and the value of each resource of `resources`. `where` holds its values as a system's does, and an archetype
 * matches it as one matches a system's `where`, required as `with` requires them.
 */
export const tablesReader = (state: State, declaration: TablesDeclaration): (() => Tables) => {
    const holds = declaration.where === undefined ? null : holdsValuesOf(state, declaration.where, true);
    if (typeof holds === "symbol") throw new Error(`Tables' where names "${labelOf(holds)}", which isn't a shared component.`);
    const where = declaration.where === undefined ? [] : Object.getOwnPropertySymbols(declaration.where);
    return () => readTables(state, declaration, [...where, ...declaration.with ?? []], holds);
};

const readTables = (state: State, declaration: TablesDeclaration, requiring: readonly Key[], holds: ((archetype: Archetype) => boolean) | null): Tables => {
    const asked = declaration.components.map(key => ({ key, id: idOf(state, key) }));
    const required = requiring.map(key => idOf(state, key));
    const excluded = (declaration.not ?? []).map(key => idOf(state, key));
    const archetypes: Table[] = [];
    for (const archetype of state.archetypes) {
        const { count } = archetype;
        if (count === 0 || archetype.reclaimed) continue;
        const { storageById } = archetype;
        if (required.some(id => storageById[id] === undefined) || excluded.some(id => storageById[id] !== undefined)) continue;
        if (holds !== null && !holds(archetype)) continue;
        const columns: { [key: symbol]: Table.Column } = {};
        let held = false;
        for (const { key, id } of asked) {
            const storage = storageById[id];
            if (storage === undefined) continue;
            columns[key] = columnOf(state, key, id, archetype, storage, count);
            held = true;
        }
        if (held) archetypes.push({ count, entities: archetype.entities.slice(0, count), columns });
    }
    const resources: { [key: symbol]: unknown } = {};
    for (const key of declaration.resources ?? []) {
        const cell = resourceCell(state, key);
        const id = cell.storage.component;
        if (cell.storage.remote === null) resources[key] = readCell(cell.storage, cell.row);
        else if (state.gathered?.resources.has(id) === true) resources[key] = state.gathered.resources.get(id);
        else throw ungathered(state, key, id);
    }
    return { archetypes, resources };
};
