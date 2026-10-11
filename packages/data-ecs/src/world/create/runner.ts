import type { Commands } from '../../system/commands.js';
import type { Leaf } from '../../system/leaf.js';
import type { Archetype } from './archetype.js';
import { kernelOf } from './attach-kernel.js';
import { bindKernel, type BoundKernel } from './kernels.js';
import { readCell } from './cells.js';
import { resourceCell } from './resources.js';
import { createContext, createRow, type Cursor } from './rows.js';
import { idOf, type State } from './state.js';

/** Runs one leaf system against the current state. Each execution takes a new tick and becomes the system's `lastRun`. */
export type Runner = { readonly execute: (args: unknown) => void };

type Filter = { readonly added: readonly Float64Array[]; readonly changed: readonly Float64Array[] };

const passes = (filter: Filter, row: number, lastRun: number): boolean => {
    for (const ticks of filter.added) if (ticks[row] > lastRun) return true;
    for (const ticks of filter.changed) if (ticks[row] > lastRun) return true;
    return false;
};

/** Throws if the leaf is a kernel that wasn't compiled or doesn't match its schemas. */
export const createRunner = (state: State, leaf: Leaf, commands: Commands): Runner => {
    const { declaration } = leaf;
    // Method parameters are bivariant, so the runtime can see any leaf's body with erased row and context types.
    const system: { body(row: object | undefined, context: object, commands: Commands): void } = leaf;
    const { query, resources } = declaration;
    const required = [...new Set([...query?.read ?? [], ...query?.write ?? [], ...query?.has ?? [], ...query?.added ?? [], ...query?.changed ?? []])].map(key => idOf(state, key));
    const excluded = (query?.not ?? []).map(key => idOf(state, key));
    const addedIds = (query?.added ?? []).map(key => idOf(state, key));
    const changedIds = (query?.changed ?? []).map(key => idOf(state, key));
    const resourceChanged = resources?.changed ?? [];
    const filtered = addedIds.length + changedIds.length + resourceChanged.length > 0;
    let bound: BoundKernel | null = null;
    if (declaration.kernel === true) {
        const description = kernelOf(leaf);
        if (description === undefined) throw new Error(`System "${declaration.name}" is a kernel but wasn't compiled; add kernelPlugin() to the Vite config.`);
        bound = bindKernel(state, leaf, description);
    }
    const context = createContext(state, declaration);
    const matches: Archetype[] = [];
    let checked = 0;
    const rows = new Map<Archetype, { readonly row: object; readonly cursor: Cursor }>();
    let lastRun = 0;

    const refreshMatches = (): void => {
        for (; checked < state.archetypes.length; checked++) {
            const archetype = state.archetypes[checked];
            if (!archetype.resource && required.every(id => archetype.storageOf.has(id)) && !excluded.some(id => archetype.storageOf.has(id))) matches.push(archetype);
        }
    };

    const filterOf = (archetype: Archetype): Filter => ({
        added: addedIds.map(id => archetype.storageOf.get(id)?.added ?? new Float64Array(0)),
        changed: changedIds.map(id => archetype.storageOf.get(id)?.changed ?? new Float64Array(0)),
    });

    const rowOf = (archetype: Archetype): { readonly row: object; readonly cursor: Cursor } => {
        let entry = rows.get(archetype);
        if (entry === undefined) {
            const cursor: Cursor = { row: 0 };
            entry = { row: createRow(state, archetype, query?.read ?? [], query?.write ?? [], cursor), cursor };
            rows.set(archetype, entry);
        }
        return entry;
    };

    const runBody = (archetype: Archetype, all: boolean): void => {
        const { row, cursor } = rowOf(archetype);
        const filter = filterOf(archetype);
        for (let index = 0; index < archetype.count; index++) {
            if (!all && !passes(filter, index, lastRun)) continue;
            cursor.row = index;
            system.body(row, context, commands);
        }
    };

    const runKernel = (kernel: BoundKernel, archetype: Archetype, all: boolean, values: readonly unknown[], args: unknown): void => {
        const columns = kernel.columnsOf(archetype);
        const { count } = archetype;
        const call = (start: number, end: number): void =>
            kernel.kernel(columns, start, end, values, kernel.lookups, kernel.description.keys, args, commands, state.tick);
        if (all) return call(0, count);
        const filter = filterOf(archetype);
        let start = -1;
        for (let index = 0; index < count; index++) {
            if (passes(filter, index, lastRun)) {
                if (start < 0) start = index;
            }
            else if (start >= 0) {
                call(start, index);
                start = -1;
            }
        }
        if (start >= 0) call(start, count);
    };

    const execute = (args: unknown): void => {
        const tick = ++state.tick;
        try {
            const resourcesChanged = resourceChanged.some(key => {
                const { storage, row } = resourceCell(state, key);
                return storage.changed[row] > lastRun;
            });
            const all = !filtered || resourcesChanged;
            context.args = args;
            if (query === undefined) {
                if (all) system.body(undefined, context, commands);
                return;
            }
            refreshMatches();
            const values = bound?.description.resources.map(key => {
                const { storage, row } = resourceCell(state, key);
                return readCell(storage, row);
            }) ?? [];
            for (const archetype of matches) {
                if (archetype.count === 0) continue;
                if (bound !== null) runKernel(bound, archetype, all, values, args);
                else runBody(archetype, all);
            }
        }
        finally {
            lastRun = tick;
        }
    };

    return { execute };
};
