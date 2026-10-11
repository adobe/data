import type { Leaf } from '../../system/leaf.js';
import type { Archetype } from './archetype.js';
import type { Kernel, KernelDescription, KernelModule } from './kernel.js';
import { samePath, type TypedArray } from './layout.js';
import type { LookupSetup, Source } from './protocol.js';
import { createArrayLookup } from './rows.js';
import { idOf, type Key, type State } from './state.js';

export type BoundKernel = {
    readonly description: KernelDescription;
    readonly lookups: readonly ReturnType<typeof createArrayLookup>[];
    /** What a worker needs to run the kernel, with component ids in place of keys. */
    readonly setup: { readonly sources: readonly Source[]; readonly booleans: readonly boolean[]; readonly lookups: readonly LookupSetup[]; readonly keys: readonly number[] };
    /** The kernel's columns for an archetype, rebuilt after the archetype grows. */
    readonly columnsOf: (archetype: Archetype) => readonly TypedArray[];
    /** Imports the kernel module; `kernel` throws until it resolves. */
    readonly load: () => Promise<void>;
    readonly kernel: () => Kernel;
};

/**
 * Checks the compiler's shape assumptions against the registered schemas.
 * Throws if a column names a missing leaf or a whole-value write doesn't cover every leaf.
 */
export const bindKernel = (state: State, leaf: Leaf, description: KernelDescription): BoundKernel => {
    const { name, lookup, query, resources } = leaf.declaration;
    const fail = (message: string): never => { throw new Error(`Kernel "${name}": ${message}`); };
    const queried = new Set<Key>([...query?.read ?? [], ...query?.write ?? []]);
    const written = new Set<Key>(query?.write);
    const readable = new Set<Key>(resources?.read);
    for (const key of description.resources) if (!readable.has(key)) fail(`reads resource "${String(key)}", which isn't in resources.read.`);
    const booleans: boolean[] = [];
    const sources: Source[] = description.columns.map(column => {
        if (column.kind === "entity") {
            booleans.push(false);
            return column;
        }
        if (!queried.has(column.component)) return fail(`"${String(column.component)}" isn't in the query's read or write.`);
        const id = idOf(state, column.component);
        if (column.kind === "changed") {
            if (!written.has(column.component)) return fail(`writes "${String(column.component)}", which isn't in the query's write.`);
            booleans.push(false);
            return { kind: "changed", id, leaf: 0 };
        }
        const layout = state.layouts[id];
        if (layout.kind !== "linear") return fail(`"${String(column.component)}" isn't stored in linear memory.`);
        const index = layout.leaves.findIndex(leaf => samePath(leaf.path, column.path));
        if (index < 0) return fail(`"${String(column.component)}" has no scalar at [${column.path.join(", ")}]; destructure tuples and structs or index their fields.`);
        booleans.push(layout.leaves[index].scalar === "boolean");
        return { kind: "field", id, leaf: index };
    });
    for (const shape of description.shapes) {
        if (!written.has(shape.component)) fail(`writes "${String(shape.component)}", which isn't in the query's write.`);
        const layout = state.layouts[idOf(state, shape.component)];
        const leaves = layout.kind === "linear" ? layout.leaves : [];
        const exact = leaves.length === shape.leaves.length && leaves.every(leaf => shape.leaves.some(path => samePath(path, leaf.path)));
        if (!exact) fail(`a whole-value write of "${String(shape.component)}" doesn't match its schema.`);
    }
    const declaredLookups = description.lookups.map(lookupName => lookup?.[lookupName] ?? fail(`unknown lookup "${lookupName}".`));
    // Workers read lookups from shared memory, so their values must be linear there too.
    for (const declared of declaredLookups) {
        for (const key of declared.read ?? []) {
            if (state.layouts[idOf(state, key)].kind === "object") fail(`a lookup reads "${String(key)}", which isn't stored in linear memory.`);
        }
    }
    const lookups = declaredLookups.map(declared => createArrayLookup(state, declared));
    const ids = (keys: readonly Key[] | undefined): number[] => (keys ?? []).map(key => idOf(state, key));
    const setup = {
        sources,
        booleans,
        lookups: declaredLookups.map(declared => ({ read: ids(declared.read), has: ids(declared.has), not: ids(declared.not) })),
        keys: ids(description.keys),
    };
    const cache = new Map<Archetype, { version: number; columns: readonly TypedArray[] }>();
    const columnsOf = (archetype: Archetype): readonly TypedArray[] => {
        const cached = cache.get(archetype);
        if (cached !== undefined && cached.version === archetype.version) return cached.columns;
        const columns = sources.map(source => {
            if (source.kind === "entity") return archetype.entities;
            const storage = archetype.storageOf.get(source.id);
            if (storage === undefined) return fail(`column of "${String(state.keys[source.id])}" isn't in the query.`);
            return source.kind === "changed" ? storage.changed : storage.fields[source.leaf];
        });
        cache.set(archetype, { version: archetype.version, columns });
        return columns;
    };
    let loaded: Kernel | null = null;
    const load = async (): Promise<void> => {
        const module: KernelModule = await import(/* @vite-ignore */ description.url);
        loaded = module.create(booleans);
    };
    const kernel = (): Kernel => loaded ?? fail("its module isn't loaded.");
    return { description, lookups, setup, columnsOf, load, kernel };
};
