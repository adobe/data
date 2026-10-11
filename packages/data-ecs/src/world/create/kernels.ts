import type { Leaf } from '../../system/leaf.js';
import type { Archetype } from './archetype.js';
import type { Kernel, KernelDescription, KernelModule } from './kernel.js';
import { layoutOf, samePath, type Layout, type TypedArray } from '../../layout/layout.js';
import type { LookupSetup, Source } from './protocol.js';
import { createArrayLookup } from './rows.js';
import { idOf, type Key, type State } from './state.js';
import { generateWasm, instantiateWasm, type Type, type WasmColumn, type WasmKernel, type WasmRun, type WasmScalar } from './wasm.js';

export type BoundKernel = {
    readonly description: KernelDescription;
    readonly lookups: readonly ReturnType<typeof createArrayLookup>[];
    /** What a worker needs to run the kernel, with component ids in place of keys. */
    readonly setup: {
        readonly sources: readonly Source[];
        readonly booleans: readonly boolean[];
        readonly strides: readonly number[];
        readonly offsets: readonly number[];
        readonly lookups: readonly LookupSetup[];
        readonly keys: readonly number[];
    };
    /** The kernel's columns for an archetype, rebuilt after the archetype grows. */
    readonly columnsOf: (archetype: Archetype) => readonly TypedArray[];
    /** Imports the kernel module, and compiles its WASM; `kernel` throws until it resolves. */
    readonly load: () => Promise<void>;
    readonly kernel: () => Kernel;
    /** The WASM version, when the kernel has a program and the world shares its memory. */
    readonly wasm: WasmKernel | null;
    /** The compiled module and the main thread's instance, once loaded. */
    readonly compiled: () => { readonly module: WebAssembly.Module; readonly run: WasmRun } | null;
};

/** Whether a scalar leaf at `path` is a boolean, a number, or not a scalar leaf. */
const leafType = (layout: Layout, path: readonly (number | string)[]): Type | null => {
    if (layout.kind !== "linear") return null;
    const leaf = layout.leaves.find(candidate => samePath(candidate.path, path));
    return leaf === undefined ? null : leaf.scalar === "boolean" ? "boolean" : "number";
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
    // Per column, in elements of its view: entity and tick columns are dense.
    const strides: number[] = [];
    const offsets: number[] = [];
    const wasmColumns: WasmColumn[] = [];
    const dense = (): void => {
        booleans.push(false);
        strides.push(1);
        offsets.push(0);
        wasmColumns.push({ view: "f64", stride: 8, offset: 0, boolean: false, component: -1 });
    };
    const sources: Source[] = description.columns.map(column => {
        if (column.kind === "entity") {
            dense();
            return column;
        }
        if (!queried.has(column.component)) return fail(`"${String(column.component)}" isn't in the query's read or write.`);
        const id = idOf(state, column.component);
        if (column.kind === "changed" || column.kind === "chunks") {
            if (!written.has(column.component)) return fail(`writes "${String(column.component)}", which isn't in the query's write.`);
            dense();
            return { kind: column.kind, id, leaf: 0 };
        }
        const layout = state.layouts[id];
        if (layout.kind !== "linear") return fail(`"${String(column.component)}" isn't stored in linear memory.`);
        const index = layout.leaves.findIndex(leaf => samePath(leaf.path, column.path));
        if (index < 0) return fail(`"${String(column.component)}" has no scalar at [${column.path.join(", ")}]; destructure tuples and structs or index their fields.`);
        const found = layout.leaves[index];
        booleans.push(found.scalar === "boolean");
        strides.push(found.unitStride);
        offsets.push(found.unitOffset);
        wasmColumns.push({ view: found.view, stride: layout.stride, offset: found.offset, boolean: found.scalar === "boolean", component: id });
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
        strides,
        offsets,
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
            if (source.kind === "changed") return storage.changed;
            if (source.kind === "chunks") return storage.chunkChanged;
            const layout = state.layouts[source.id];
            return layout.kind === "linear" ? storage.views[layout.leaves[source.leaf].view] : fail("a field column isn't linear.");
        });
        cache.set(archetype, { version: archetype.version, columns });
        return columns;
    };
    const argsLayout = leaf.declaration.args === undefined ? null : layoutOf(leaf.declaration.args);
    const scalarType = (scalar: WasmScalar): Type | null => scalar.source === "args"
        ? argsLayout === null ? null : leafType(argsLayout, scalar.path)
        : scalar.index < description.resources.length ? leafType(state.layouts[idOf(state, description.resources[scalar.index])], scalar.path) : null;
    const wasm = state.wasm && state.memory.shared && description.program !== null ? generateWasm(description.program, wasmColumns, scalarType, state.simd) : null;
    let loaded: Kernel | null = null;
    let compiled: { readonly module: WebAssembly.Module; readonly run: WasmRun } | null = null;
    const load = async (): Promise<void> => {
        const module: KernelModule = await import(/* @vite-ignore */ description.url);
        loaded = module.create(booleans, strides, offsets);
        if (wasm === null) return;
        const wasmModule = await WebAssembly.compile(wasm.bytes);
        compiled = { module: wasmModule, run: await instantiateWasm(wasmModule, state.memory.memory, wasm.imports) };
    };
    const kernel = (): Kernel => loaded ?? fail("its module isn't loaded.");
    return { description, lookups, setup, columnsOf, load, kernel, wasm, compiled: () => compiled };
};
