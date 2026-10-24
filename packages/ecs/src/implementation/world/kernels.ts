// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Leaf } from '../../interface/system/leaf.js';
import type { Archetype } from './archetype.js';
import type { Kernel, KernelDescription, KernelModule } from './kernel.js';
import { layoutOf, samePath, type Layout, type TypedArray } from '../../interface/registry/layout.js';
import type { LookupSetup, Source , KernelSetup } from './protocol.js';
import { createArrayLookup } from './rows.js';
import type { Since } from './index-lookups.js';
import { commandIdOf, idOf, type Key, type State } from './state.js';
import { generateWasm, instantiateWasm, type Type, type WasmColumn, type WasmKernel, type WasmLookup, type WasmRun, type WasmScalar } from './wasm.js';
import { createDirectory, lookupParameters, type Directory } from './directories.js';
import { generateWgsl, type WgslKernel } from './wgsl.js';
import { labelOf } from '../../interface/registry/index.js';
import { absentColumn, emptyViews } from './arrays.js';
import type { WorldIndex } from './indexes.js';
import { kernelIndexesOf, refreshSource, writeIndexParameters, type KernelIndex } from './kernel-indexes.js';
import { createIndexReader, createIndexSource, type IndexReaderSetup } from './index-readers.js';

/** A kernel without lookups passes no lookup parameters; read-only, so one is shared. */
const noParameters: readonly number[] = [];

export type BoundKernel = {
    readonly description: KernelDescription;
    /** Workers' index for it: one per kernel's code, its module's url, so new values of one kernel share it. */
    readonly index: number;
    /** Its lookups' directories, which the world keeps current until they're released. */
    readonly directories: readonly Directory[];
    /** By lookup: a function by entity, or for a lookup through an index its reader, which `refreshIndexes` points at the index. */
    readonly lookups: readonly unknown[];
    /** By lookup, its index for a lookup through one, else null. */
    readonly indexes: readonly (KernelIndex | null)[];
    /** Points the JS readers at their indexes as they are now, and returns the WASM parameters of every lookup through one. */
    readonly refreshIndexes: (since: number) => readonly number[];
    /** What a worker needs to run the kernel, with component ids in place of keys; replaced by each load. */
    setup: {
        readonly sources: readonly Source[];
        readonly booleans: readonly boolean[];
        readonly strides: readonly number[];
        readonly offsets: readonly number[];
        readonly lookups: readonly LookupSetup[];
        /** By lookup through an index: its lookup, how its JS reader reads it, and how many components it watches. */
        readonly indexes: readonly { readonly lookup: number; readonly reader: IndexReaderSetup; readonly watched: number }[];
        readonly keys: readonly number[];
        readonly labels: readonly string[];
        readonly optional: readonly number[];
        readonly starts: readonly unknown[];
        /** The component ids of each list the kernel spawns, in the order its spawner takes values. */
        readonly spawns: readonly (readonly number[])[];
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
    /**
     * Whether it needs loading: it never was, or a component whose stamps it muted is observed now. One no longer
     * observed keeps its stamps until it loads again for another reason, so a filter coming and going reloads nothing.
     */
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
    /** Whether an archetype has every optional component, the only archetypes its WASM runs: JS runs the rest. */
    readonly allPresent: (archetype: Archetype) => boolean;
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
 * Binds a kernel to the world's components and layouts. Registering the kernel checked it against its declaration and
 * schemas (`checkKernel`), so a mismatch here is an invariant broken.
 */
export const bindKernel = (state: State, leaf: Leaf, description: KernelDescription, byName: ReadonlyMap<string, WorldIndex> = new Map(), since: Since = { value: 0 }): BoundKernel => {
    const { lookup, components: query } = leaf.declaration;
    const fail = (message: string): never => { throw new Error(`Kernel "${leaf.name}": ${message}`); };
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
        const id = idOf(state, column.component);
        if (column.kind === "changed" || column.kind === "chunks" || column.kind === "blocks" || column.kind === "present") {
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
    const declaredLookups = description.lookups.map(lookupName => lookup?.[lookupName] ?? fail(`unknown lookup "${lookupName}".`));
    const { up } = leaf.declaration;
    const indexes = kernelIndexesOf(state, description, declaredLookups, byName, fail);
    /** Each lookup through an index's reader for the JS kernel, over its index's own arrays. */
    const readers = indexes.map(bound => bound === null ? null : { bound, reader: createIndexReader(bound.reader, createIndexSource(bound.reader.kind), id => {
        const archetype = state.archetypes[id];
        return archetype === undefined ? undefined : { version: archetype.version, entities: archetype.entities, column: (component, view) => archetype.storageById[component]?.views[view] };
    }) });
    // The runner passes `up`'s lookup after these, since it records each row's parent as it orders the rows.
    const lookups: readonly unknown[] = declaredLookups.map((declared, k): unknown => readers[k]?.reader ?? createArrayLookup(state, declared, since));
    const indexParameters: number[] = [];
    const refreshIndexes = (since: number): readonly number[] => {
        let at = 0;
        for (const found of readers) {
            if (found === null) continue;
            refreshSource(found.reader.source, found.bound, since);
            at = writeIndexParameters(found.bound, since, indexParameters, at);
        }
        indexParameters.length = at;
        return indexParameters;
    };
    const ids = (keys: readonly Key[] | undefined): number[] => (keys ?? []).map(key => idOf(state, key));
    const keys = description.keys.map(key => commandIdOf(state, key));
    const spawns = description.spawns.map(list => list.map(k => keys[k]));
    const setup = {
        sources,
        booleans,
        strides,
        offsets,
        lookups: declaredLookups.map((declared): LookupSetup => ({
            read: ids(declared.read), has: ids("has" in declared ? declared.has : undefined), optional: ids("optional" in declared ? declared.optional : undefined), not: ids("not" in declared ? declared.not : undefined),
            changed: "index" in declared || declared.changed === undefined ? null : ids(declared.changed),
        })),
        indexes: indexes.flatMap(bound => bound === null ? [] : [{ lookup: bound.lookup, reader: bound.reader, watched: bound.watched.length }]),
        keys,
        labels: keys.map(id => labelOf(state.keys[id])),
        optional: ids(leaf.declaration.components?.optional),
        starts: keys.map(id => state.starts[id]),
        spawns,
    };
    /** Every component its lookups by entity watch. */
    const watched = [...new Set(setup.lookups.flatMap(lookupSetup => lookupSetup.changed ?? []))];
    /** The one parameter a JS kernel watching without directories takes. */
    const sinceParameters = [0];
    /**
     * The tick its lookups by entity compare with, passed after the lookup parameters: its `lastRun`, or -1 once a
     * GPU kernel stamped a whole column of one it watches since, so every row counts as changed.
     */
    const lookupsSince = (): number => {
        const { value } = since;
        if (state.gpu === null) return value;
        for (const archetype of state.archetypes) {
            for (let k = 0; k < watched.length; k++) {
                const storage = archetype.storageById[watched[k]];
                if (storage !== undefined && storage.ticked && storage.columnChanged > value) return -1;
            }
        }
        return value;
    };
    const optional = new Set(setup.optional);
    const cache = new Map<Archetype, { version: number; columns: readonly TypedArray[] }>();
    const columnsOf = (archetype: Archetype): readonly TypedArray[] => {
        const cached = cache.get(archetype);
        if (cached !== undefined && cached.version === archetype.version) return cached.columns;
        const columns = sources.map(source => {
            if (source.kind === "entity") return archetype.entities;
            // An optional component's presence: any column that has rows where the archetype has it, empty where it doesn't.
            if (source.kind === "present") return archetype.storageOf.has(source.id) ? archetype.entities : emptyViews.f64;
            const storage = archetype.storageOf.get(source.id);
            // An optional component's columns are empty where the archetype lacks it: reads give undefined.
            if (storage === undefined && optional.has(source.id)) return absentColumn(state.layouts[source.id], source);
            if (storage === undefined) return fail(`column of "${labelOf(state.keys[source.id])}" isn't in its components.`);
            if (source.kind === "changed") return storage.changed;
            if (source.kind === "chunks") return storage.chunkChanged;
            if (source.kind === "blocks") return storage.blockChanged;
            const layout = state.layouts[source.id];
            return layout.kind === "linear" ? storage.views[layout.leaves[source.leaf].view] : fail("a field column isn't linear.");
        });
        cache.set(archetype, { version: archetype.version, columns });
        return columns;
    };
    // A leaf's stride and offset depend only on its component's layout, so they're the same in every parent archetype.
    const upSources = (description.upColumns ?? []).map(column => {
        if (column.kind !== "field") return fail("reads a column through up that isn't a field.");
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
    const argsLayout = leaf.input === undefined ? null : layoutOf(leaf.input);
    const scalarType = (scalar: WasmScalar): Type | null => scalar.source === "args"
        ? argsLayout === null ? null : leafType(argsLayout, scalar.path)
        : scalar.index < description.resources.length ? leafType(state.layouts[idOf(state, description.resources[scalar.index])], scalar.path) : null;
    const useWasm = state.wasm && state.memory.shared && description.program !== null;
    // A lookup through an index's directory also holds each archetype's entities, which its rows' `entity` reads.
    const directories = useWasm ? setup.lookups.map((lookupSetup, k) => createDirectory(state, lookupSetup.read, lookupSetup.has, lookupSetup.not, indexes[k] !== null, lookupSetup.changed ?? [])) : [];
    const wasmLookups: WasmLookup[] = setup.lookups.map((lookupSetup, k) => ({
        reads: lookupSetup.read.length + (indexes[k] === null ? 0 : 1),
        watched: lookupSetup.changed?.length ?? 0,
        leaf: (read, path) => {
            const component = lookupSetup.read[read];
            const layout = component === undefined ? undefined : state.layouts[component];
            if (layout?.kind !== "linear") return null;
            const found = layout.leaves.find(leaf => samePath(leaf.path, path));
            return found === undefined ? null : { view: found.view, stride: layout.stride, offset: found.offset, boolean: found.scalar === "boolean" };
        },
    }));
    /**
     * Changed, chunk and block columns of components no registered system filters on are muted: nothing reads those
     * ticks, so the WASM drops their stamps and the JS kernel stamps one dummy element. Chunk columns of components
     * held on the GPU stay, since uploads read them; block columns, which only filters read, go with the row ticks.
     */
    const stamped = (source: Extract<Source, { readonly id: number }>): boolean => state.observed.has(source.id) || (source.kind === "chunks" && state.resident.has(source.id));
    const mutedNow = (): boolean[] => sources.map(source => (source.kind === "changed" || source.kind === "chunks" || source.kind === "blocks") && !stamped(source));
    const upWasmColumns: WasmColumn[] = upSources.map(source => {
        const layout = state.layouts[source.id];
        return { view: source.leaf.view, stride: layout.kind === "linear" ? layout.stride : 0, offset: source.leaf.offset, boolean: source.leaf.scalar === "boolean", component: source.id };
    });
    // An `up` kernel's runner passes only the rows that pass its filters.
    const filterCount = up !== undefined ? 0 : (query?.added?.length ?? 0) + (query?.changed?.length ?? 0);
    const generate = (muted: readonly boolean[]): WasmKernel | null => useWasm && description.program !== null
        ? generateWasm(description.program, wasmColumns.map((column, k) => muted[k] ? { ...column, muted: true } : column), scalarType, state.simd, filterCount, wasmLookups, upWasmColumns,
            description.reductions.map(reduction => reduction.operator), indexes.map(bound => bound?.wasm ?? null), (description.probes ?? []).map(probe => probe.lookup),
            description.storagePrecision === true)
        : null;
    let muted = mutedNow();
    let index = state.kernelIndexes.get(description.url);
    if (index === undefined) state.kernelIndexes.set(description.url, index = state.kernelIndexes.size);
    let loaded: Kernel | null = null;
    let loadedFor: string | null = null;
    let workersFor: string | null = null;
    let compiled: { readonly module: WebAssembly.Module; readonly run: WasmRun } | null = null;
    const bound: BoundKernel = {
        description,
        index,
        directories,
        lookups,
        indexes,
        refreshIndexes,
        setup: { ...setup, muted, up: upSetup },
        columnsOf: archetype => {
            const columns = columnsOf(archetype);
            return muted.some(Boolean) ? columns.map((column, k) => muted[k] ? mutedColumn : column) : columns;
        },
        upColumnsOf,
        wasm: generate(muted),
        allPresent: archetype => {
            for (const id of setup.optional) if (!archetype.storageOf.has(id)) return false;
            return true;
        },
        compiled: () => compiled,
        kernel: () => loaded ?? fail("its module isn't loaded."),
        stale: () => {
            if (loadedFor === null) return true;
            for (let k = 0; k < sources.length; k++) {
                const source = sources[k];
                if (muted[k] && source.kind !== "entity" && stamped(source)) return true;
            }
            return false;
        },
        staleOnWorkers: () => workersFor !== loadedFor,
        loadedOnWorkers: () => { workersFor = loadedFor; },
        unloadedOnWorkers: () => { workersFor = null; },
        load: async () => {
            muted = mutedNow();
            bound.wasm = generate(muted);
            bound.setup = { ...setup, muted, up: upSetup };
            loadedFor = muted.join();
            const module: KernelModule = await import(/* @vite-ignore */ description.url);
            loaded = module.create(booleans, strides.map((stride, k) => muted[k] ? 0 : stride), offsets.map((offset, k) => muted[k] ? 0 : offset), upSetup.booleans, upSetup.strides, upSetup.offsets, setup.labels);
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
        lookupParameters: watched.length === 0
            ? () => directories.length === 0 ? noParameters : lookupParameters(state, directories)
            : () => {
                if (directories.length === 0) {
                    sinceParameters[0] = lookupsSince();
                    return sinceParameters;
                }
                const parameters = lookupParameters(state, directories);
                parameters.push(lookupsSince());
                return parameters;
            },
        gpu: () => description.program === null
            ? "it issues commands or uses values that aren't numbers"
            : description.lookups.length > 0 ? "it uses lookups"
            : generateWgsl(description.program, wasmColumns.map((column, k) => muted[k] ? { ...column, muted: true } : column), scalarType, upWasmColumns),
    };
    return bound;
};

/** The one element a muted tick column's stores land on. */
const mutedColumn = new Float64Array(1);
