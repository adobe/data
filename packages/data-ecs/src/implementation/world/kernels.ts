import type { Leaf } from '../../interface/system/leaf.js';
import type { Archetype } from './archetype.js';
import type { Kernel, KernelDescription, KernelModule } from './kernel.js';
import { layoutOf, samePath, type Layout, type TypedArray } from '../../interface/registry/layout.js';
import type { LookupSetup, Source , KernelSetup } from './protocol.js';
import { createArrayLookup } from './rows.js';
import { commandIdOf, idOf, type Key, type State } from './state.js';
import { generateWasm, instantiateWasm, type Type, type WasmColumn, type WasmKernel, type WasmLookup, type WasmRun, type WasmScalar } from './wasm.js';
import { createDirectory, lookupParameters } from './directories.js';
import { generateWgsl, type WgslKernel } from './wgsl.js';
import { labelOf, labelOfItem } from '../../interface/registry/index.js';

/** A kernel without lookups passes no lookup parameters; read-only, so one is shared. */
const noParameters: readonly number[] = [];

export type BoundKernel = {
    readonly description: KernelDescription;
    readonly lookups: readonly ReturnType<typeof createArrayLookup>[];
    /** What a worker needs to run the kernel, with component ids in place of keys; replaced by each load. */
    setup: {
        readonly sources: readonly Source[];
        readonly booleans: readonly boolean[];
        readonly strides: readonly number[];
        readonly offsets: readonly number[];
        readonly lookups: readonly LookupSetup[];
        readonly keys: readonly number[];
        readonly starts: readonly unknown[];
        /** Tick columns whose stamps nothing observes. */
        readonly muted: readonly boolean[];
        readonly up: KernelSetup["up"];
    };
    /** The kernel's columns for an archetype, rebuilt after the archetype grows. */
    readonly columnsOf: (archetype: Archetype) => readonly TypedArray[];
    /** A parent archetype's columns of the parent's components the kernel reads through `up`. */
    readonly upColumnsOf: (archetype: Archetype) => readonly TypedArray[];
    /** Imports the kernel module and compiles its WASM for the components observed now; `kernel` throws until it resolves. */
    readonly load: () => Promise<void>;
    /** Whether the observed components changed since the last load, so its stamps need regenerating. */
    readonly stale: () => boolean;
    /** Whether workers have an older load than the main thread; `loadedOnWorkers` records that they caught up. */
    readonly staleOnWorkers: () => boolean;
    readonly loadedOnWorkers: () => void;
    /** Records that workers hold no load, as a new pool's don't. */
    readonly unloadedOnWorkers: () => void;
    readonly kernel: () => Kernel;
    /** The WASM version, when the kernel has a program and the world shares its memory; replaced by each load. */
    wasm: WasmKernel | null;
    /** The compiled module and the main thread's instance, once loaded. */
    readonly compiled: () => { readonly module: WebAssembly.Module; readonly run: WasmRun } | null;
    /** For a WASM kernel with lookups: the entity table and directories, passed ahead of the scalars. */
    readonly lookupParameters: () => readonly number[];
    /** The kernel as a compute shader for the components observed at the last load, or why it can't run on the GPU. */
    readonly gpu: () => WgslKernel | string;
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
    const { lookup, components: query, resources } = leaf.declaration;
    const fail = (message: string): never => { throw new Error(`Kernel "${labelOfItem(leaf)}": ${message}`); };
    const queried = new Set<Key>([...query?.read ?? [], ...query?.write ?? []]);
    const written = new Set<Key>(query?.write);
    const readable = new Set<Key>(resources?.read);
    for (const key of description.resources) if (!readable.has(key)) fail(`reads resource "${labelOf(key)}", which isn't in resources.read.`);
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
        if (!queried.has(column.component)) return fail(`"${labelOf(column.component)}" isn't in its components' read or write.`);
        const id = idOf(state, column.component);
        if (column.kind === "changed" || column.kind === "chunks") {
            if (!written.has(column.component)) return fail(`writes "${labelOf(column.component)}", which isn't in its components' write.`);
            dense();
            return { kind: column.kind, id, leaf: 0 };
        }
        const layout = state.layouts[id];
        if (layout.kind !== "linear") return fail(`"${labelOf(column.component)}" isn't stored in linear memory.`);
        const index = layout.leaves.findIndex(leaf => samePath(leaf.path, column.path));
        if (index < 0) return fail(`"${labelOf(column.component)}" has no scalar at [${column.path.join(", ")}]; destructure tuples and structs or index their fields.`);
        const found = layout.leaves[index];
        booleans.push(found.scalar === "boolean");
        strides.push(found.unitStride);
        offsets.push(found.unitOffset);
        wasmColumns.push({ view: found.view, stride: layout.stride, offset: found.offset, boolean: found.scalar === "boolean", component: id });
        return { kind: "field", id, leaf: index };
    });
    for (const shape of description.shapes) {
        if (!written.has(shape.component)) fail(`writes "${labelOf(shape.component)}", which isn't in its components' write.`);
        const layout = state.layouts[idOf(state, shape.component)];
        const leaves = layout.kind === "linear" ? layout.leaves : [];
        const exact = leaves.length === shape.leaves.length && leaves.every(leaf => shape.leaves.some(path => samePath(path, leaf.path)));
        if (!exact) fail(`a whole-value write of "${labelOf(shape.component)}" doesn't match its schema.`);
    }
    const declaredLookups = description.lookups.map(lookupName => lookup?.[lookupName] ?? fail(`unknown lookup "${lookupName}".`));
    // Workers read lookups from shared memory, so their values must be linear there too.
    for (const declared of declaredLookups) {
        for (const key of declared.read ?? []) {
            if (state.layouts[idOf(state, key)].kind === "object") fail(`a lookup reads "${labelOf(key)}", which isn't stored in linear memory.`);
        }
    }
    const { up } = leaf.declaration;
    if ((description.up === true) !== (up !== undefined)) fail(description.up === true ? "reads up, which its declaration doesn't declare." : "its declaration declares up, which it doesn't read.");
    // The runner passes `up`'s lookup after these, since it records each row's parent as it orders the rows.
    const lookups = declaredLookups.map(declared => createArrayLookup(state, declared));
    const ids = (keys: readonly Key[] | undefined): number[] => (keys ?? []).map(key => idOf(state, key));
    const keys = description.keys.map(key => commandIdOf(state, key));
    const setup = {
        sources,
        booleans,
        strides,
        offsets,
        lookups: declaredLookups.map(declared => ({ read: ids(declared.read), has: ids(declared.has), not: ids(declared.not) })),
        keys,
        starts: keys.map(id => state.starts[id]),
    };
    const cache = new Map<Archetype, { version: number; columns: readonly TypedArray[] }>();
    const columnsOf = (archetype: Archetype): readonly TypedArray[] => {
        const cached = cache.get(archetype);
        if (cached !== undefined && cached.version === archetype.version) return cached.columns;
        const columns = sources.map(source => {
            if (source.kind === "entity") return archetype.entities;
            const storage = archetype.storageOf.get(source.id);
            if (storage === undefined) return fail(`column of "${labelOf(state.keys[source.id])}" isn't in its components.`);
            if (source.kind === "changed") return storage.changed;
            if (source.kind === "chunks") return storage.chunkChanged;
            const layout = state.layouts[source.id];
            return layout.kind === "linear" ? storage.views[layout.leaves[source.leaf].view] : fail("a field column isn't linear.");
        });
        cache.set(archetype, { version: archetype.version, columns });
        return columns;
    };
    // A leaf's stride and offset depend only on its component's layout, so they're the same in every parent archetype.
    const upReadable = new Set<Key>(up?.read);
    const upSources = (description.upColumns ?? []).map(column => {
        if (column.kind !== "field" || !upReadable.has(column.component)) return fail(`reads "${labelOf(column.kind === "field" ? column.component : column.kind)}" through up, which isn't in up.read.`);
        const id = idOf(state, column.component);
        const layout = state.layouts[id];
        if (layout.kind !== "linear") return fail(`up reads "${labelOf(column.component)}", which isn't stored in linear memory.`);
        const found = layout.leaves.find(candidate => samePath(candidate.path, column.path));
        if (found === undefined) return fail(`"${labelOf(column.component)}" has no scalar at [${column.path.join(", ")}]; destructure tuples and structs or index their fields.`);
        return { id, leaf: found };
    });
    const upSetup: KernelSetup["up"] = {
        booleans: upSources.map(source => source.leaf.scalar === "boolean"),
        strides: upSources.map(source => source.leaf.unitStride),
        offsets: upSources.map(source => source.leaf.unitOffset),
    };
    const upCache = new Map<Archetype, { version: number; columns: readonly TypedArray[] }>();
    const upColumnsOf = (archetype: Archetype): readonly TypedArray[] => {
        const cached = upCache.get(archetype);
        if (cached !== undefined && cached.version === archetype.version) return cached.columns;
        const columns = upSources.map(source => {
            const storage = archetype.storageById[source.id];
            return storage === undefined ? fail(`a parent's archetype has no "${labelOf(state.keys[source.id])}".`) : storage.views[source.leaf.view];
        });
        upCache.set(archetype, { version: archetype.version, columns });
        return columns;
    };
    const argsLayout = leaf.declaration.input === undefined ? null : layoutOf(leaf.declaration.input);
    const scalarType = (scalar: WasmScalar): Type | null => scalar.source === "args"
        ? argsLayout === null ? null : leafType(argsLayout, scalar.path)
        : scalar.index < description.resources.length ? leafType(state.layouts[idOf(state, description.resources[scalar.index])], scalar.path) : null;
    const useWasm = state.wasm && state.memory.shared && description.program !== null;
    const directories = useWasm ? setup.lookups.map(lookupSetup => createDirectory(state, lookupSetup.read, lookupSetup.has, lookupSetup.not)) : [];
    const wasmLookups: WasmLookup[] = setup.lookups.map(lookupSetup => ({
        reads: lookupSetup.read.length,
        leaf: (read, path) => {
            const component = lookupSetup.read[read];
            const layout = component === undefined ? undefined : state.layouts[component];
            if (layout?.kind !== "linear") return null;
            const found = layout.leaves.find(leaf => samePath(leaf.path, path));
            return found === undefined ? null : { view: found.view, stride: layout.stride, offset: found.offset, boolean: found.scalar === "boolean" };
        },
    }));
    /**
     * Changed and chunk columns of components no registered system filters on are muted: nothing reads those ticks,
     * so the WASM drops their stamps and the JS kernel stamps one dummy element.
     */
    const mutedNow = (): boolean[] => sources.map(source => (source.kind === "changed" || source.kind === "chunks") && !state.observed.has(source.id));
    const upWasmColumns: WasmColumn[] = upSources.map(source => {
        const layout = state.layouts[source.id];
        return { view: source.leaf.view, stride: layout.kind === "linear" ? layout.stride : 0, offset: source.leaf.offset, boolean: source.leaf.scalar === "boolean", component: source.id };
    });
    // An `up` kernel's runner passes only the rows that pass its filters.
    const filterCount = up !== undefined ? 0 : (query?.added?.length ?? 0) + (query?.changed?.length ?? 0);
    const generate = (muted: readonly boolean[]): WasmKernel | null => useWasm && description.program !== null
        ? generateWasm(description.program, wasmColumns.map((column, k) => muted[k] ? { ...column, muted: true } : column), scalarType, state.simd, filterCount, wasmLookups, upWasmColumns, description.reductions.map(reduction => reduction.operator))
        : null;
    let muted = mutedNow();
    let loaded: Kernel | null = null;
    let loadedFor: string | null = null;
    let workersFor: string | null = null;
    let compiled: { readonly module: WebAssembly.Module; readonly run: WasmRun } | null = null;
    const bound: BoundKernel = {
        description,
        lookups,
        setup: { ...setup, muted, up: upSetup },
        columnsOf: archetype => {
            const columns = columnsOf(archetype);
            return muted.some(Boolean) ? columns.map((column, k) => muted[k] ? mutedColumn : column) : columns;
        },
        upColumnsOf,
        wasm: generate(muted),
        compiled: () => compiled,
        kernel: () => loaded ?? fail("its module isn't loaded."),
        stale: () => loadedFor !== mutedNow().join(),
        staleOnWorkers: () => workersFor !== loadedFor,
        loadedOnWorkers: () => { workersFor = loadedFor; },
        unloadedOnWorkers: () => { workersFor = null; },
        load: async () => {
            muted = mutedNow();
            bound.wasm = generate(muted);
            bound.setup = { ...setup, muted, up: upSetup };
            loadedFor = muted.join();
            const module: KernelModule = await import(/* @vite-ignore */ description.url);
            loaded = module.create(booleans, strides.map((stride, k) => muted[k] ? 0 : stride), offsets.map((offset, k) => muted[k] ? 0 : offset), upSetup.booleans, upSetup.strides, upSetup.offsets);
            compiled = null;
            if (bound.wasm === null) return;
            try {
                const wasmModule = await WebAssembly.compile(bound.wasm.bytes);
                compiled = { module: wasmModule, run: await instantiateWasm(wasmModule, state.memory.memory, bound.wasm.imports) };
            }
            catch (error) {
                // A content security policy without 'wasm-unsafe-eval' forbids compiling; the JS kernel runs instead.
                if (!(error instanceof WebAssembly.CompileError)) throw error;
                bound.wasm = null;
            }
        },
        lookupParameters: () => directories.length === 0 ? noParameters : lookupParameters(state, directories),
        gpu: () => description.program === null
            ? "it issues commands or uses values that aren't numbers"
            : description.lookups.length > 0 ? "it uses lookups"
            : generateWgsl(description.program, wasmColumns.map((column, k) => muted[k] ? { ...column, muted: true } : column), scalarType, upWasmColumns),
    };
    return bound;
};

/** The one element a muted tick column's stores land on. */
const mutedColumn = new Float64Array(1);
