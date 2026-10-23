// © 2026 Adobe. MIT License. See /LICENSE for details.
import { samePath, type Path } from '../../interface/registry/layout.js';
import { labelOf, watchedBy } from '../../interface/registry/index.js';
import type { KernelDescription } from './kernel.js';
import { partWords } from './index-keys.js';
import { sortedStride } from './index-sorted.js';
import { recordKey, sortHashTable } from './index-hash.js';
import type { WorldIndex } from './indexes.js';
import type { IndexReaderSetup, IndexSource, RowLeaf } from './index-readers.js';
import { idOf, type Key, type State } from './state.js';
import type { WasmIndexLookup, WasmKeyValue, WasmProbe } from './wasm.js';

/**
 * A kernel's lookup through an index, bound to the world's index: by the kernel's probes and row leaves, how it
 * encodes keys and reads rows, for its WASM and its JS, and the components it watches.
 */
export type KernelIndex = {
    readonly lookup: number;
    readonly index: WorldIndex;
    readonly reader: IndexReaderSetup;
    readonly wasm: WasmIndexLookup;
    readonly watched: readonly number[];
};

/** The key values a probe's argument gives a part, by its leaves' paths: each leaf's word and stored type. */
const valuesOf = (paths: readonly Path[], part: WorldIndex["parts"][number], fail: (message: string) => never, what: string): WasmKeyValue[] => {
    if (part.kind !== "leaves") return fail(`${what} isn't a struct, which kernels look up by`);
    const leaves = part.leaves;
    if (paths.length !== leaves.length || !paths.every((path, k) => samePath(path, leaves[k].path))) {
        return fail(`${what} is given leaves ${JSON.stringify(paths)}, but its leaves are ${JSON.stringify(leaves.map(leaf => leaf.path))}; give each leaf, destructuring it or indexing its fields`);
    }
    const values: WasmKeyValue[] = [];
    let word = part.first;
    for (const leaf of leaves) {
        values.push({ word, scalar: leaf.scalar });
        word += leaf.scalar === "f64" ? 2 : 1;
    }
    return values;
};

/**
 * Binds a kernel's lookups through indexes to the indexes `byName` gives, by lookup, null for one by entity. Throws for
 * a probe whose key doesn't match its index's: a hash index takes the whole key, a sorted one a prefix whose last part
 * may be a comparison, and each part all its leaves.
 */
export const kernelIndexesOf = (state: State, description: KernelDescription, lookups: readonly { readonly read?: readonly Key[]; readonly changed?: readonly Key[] | true; readonly index?: unknown }[], byName: ReadonlyMap<string, WorldIndex>, fail: (message: string) => never): readonly (KernelIndex | null)[] =>
    description.lookups.map((name, lookup): KernelIndex | null => {
        const index = byName.get(name);
        if (index === undefined) return null;
        const declared = lookups[lookup];
        const reads = (declared.read ?? []).map(key => idOf(state, key));
        const sorted = index.sorted !== null;
        const { parts, words } = index;
        const probes = (description.probes ?? []).map((probe, site): WasmProbe | null => {
            if (probe.lookup !== lookup) return null;
            const what = (part: number): string => `lookup "${name}"'s key part "${labelOf(state.keys[index.keys[part]])}" at probe ${site}`;
            const values: WasmKeyValue[] = [];
            let prefixWords = 0;
            let comparisons: WasmProbe["comparisons"] = null;
            if (probe.arguments.length > parts.length) return fail(`lookup "${name}" is given more key parts than its index has`);
            if (!sorted && probe.arguments.length !== parts.length) return fail(`lookup "${name}" goes through a hash index, which takes the whole key`);
            probe.arguments.forEach((argument, p) => {
                const part = parts[p];
                if (argument.kind === "value") {
                    values.push(...valuesOf(argument.paths, part, fail, what(p)));
                    prefixWords = part.first + partWords(part);
                    return;
                }
                if (!sorted) fail(`lookup "${name}" compares a key part, which only a sorted index takes`);
                prefixWords = part.first;
                comparisons = argument.operators.map(({ operator, paths }) => ({ operator, values: valuesOf(paths, part, fail, what(p)), words: part.first + partWords(part) }));
            });
            return { values, prefixWords, comparisons };
        });
        const rowLeaves = (description.rowLeaves ?? []).map(([of, read, path]): { readonly read: number; readonly leaf: RowLeaf; readonly offset: number; readonly stride: number } | null => {
            if (of !== lookup) return null;
            const component = reads[read];
            const layout = component === undefined ? undefined : state.layouts[component];
            if (layout?.kind !== "linear") return fail(`lookup "${name}" reads a row's value that isn't stored in linear memory`);
            const found = layout.leaves.find(leaf => samePath(leaf.path, path));
            if (found === undefined) return fail(`lookup "${name}" reads "${labelOf(state.keys[component])}" at [${path.join(", ")}], which isn't a scalar of it; destructure tuples and structs or index their fields`);
            return { read, leaf: { component, view: found.view, unitStride: found.unitStride, unitOffset: found.unitOffset, boolean: found.scalar === "boolean" }, offset: found.offset, stride: layout.stride };
        });
        const watched = watchedBy(declared).map(key => idOf(state, key));
        const stride = sorted ? sortedStride(words) : recordKey + words;
        return {
            lookup,
            index,
            reader: { kind: sorted ? "sorted" : "hash", words, stride, probes, rowLeaves: rowLeaves.map(found => found?.leaf ?? null) },
            wasm: {
                kind: sorted ? "sorted" : "hash",
                words,
                stride,
                probe: site => probes[site] ?? null,
                rowLeaf: leaf => {
                    const found = rowLeaves[leaf];
                    return found === null || found === undefined ? null : { read: found.read, column: { view: found.leaf.view, stride: found.stride, offset: found.offset, boolean: found.leaf.boolean } };
                },
                watched: watched.length,
            },
            watched,
        };
    });

/**
 * Writes a lookup through an index's WASM parameters into `out` from `at`, as of now: its arrays' addresses, counts and
 * ticks. A hash index's unsorted buckets are sorted first, since its reader reads entries by position where it can't
 * sort them.
 */
export const writeIndexParameters = (bound: Pick<KernelIndex, "index" | "watched">, since: number, out: number[], at: number): number => {
    const { hash, sorted } = bound.index;
    let next = at;
    if (hash !== null) {
        if (hash.unsorted !== 0) sortHashTable(hash);
        out[next++] = hash.slots.byteOffset;
        out[next++] = (hash.slots.length >> 1) - 1;
        out[next++] = hash.records.byteOffset;
        out[next++] = hash.entries.byteOffset;
        out[next++] = hash.ticks.byteOffset;
        out[next++] = hash.cleared;
        out[next++] = since;
        for (const component of bound.watched) out[next++] = hash.watched.get(component)?.byteOffset ?? 0;
        return next;
    }
    if (sorted === null) return next;
    out[next++] = sorted.fences.byteOffset;
    out[next++] = sorted.blocks;
    out[next++] = sorted.order.byteOffset;
    out[next++] = sorted.lengths.byteOffset;
    out[next++] = sorted.entries.byteOffset;
    out[next++] = sorted.counts.byteOffset;
    out[next++] = sorted.size;
    out[next++] = sorted.tree.byteOffset;
    out[next++] = sorted.leaves;
    out[next++] = sorted.cleared;
    out[next++] = since;
    for (const component of bound.watched) out[next++] = sorted.watched.get(component)?.tree.byteOffset ?? 0;
    return next;
};

/** Points a JS reader's source at the world's index on its own thread, as of now, its unsorted buckets sorted. */
export const refreshSource = (source: IndexSource, bound: KernelIndex, since: number): void => {
    const { hash, sorted } = bound.index;
    source.since = since;
    if (hash !== null) {
        if (hash.unsorted !== 0) sortHashTable(hash);
        source.slots = hash.slots; source.slotsBase = 0; source.mask = (hash.slots.length >> 1) - 1;
        source.records = hash.records; source.recordsBase = 0;
        source.hashEntries = hash.entries; source.hashEntriesBase = 0;
        source.ticks = hash.ticks; source.ticksBase = 0;
        source.cleared = hash.cleared;
        source.watched.length = source.watchedBases.length = 0;
        for (const component of bound.watched) {
            source.watched.push(hash.watched.get(component) ?? new Float64Array(0));
            source.watchedBases.push(0);
        }
        return;
    }
    if (sorted === null) return;
    source.fences = sorted.fences; source.fencesBase = 0; source.blocks = sorted.blocks;
    source.order = sorted.order; source.orderBase = 0;
    source.lengths = sorted.lengths; source.lengthsBase = 0;
    source.sortedEntries = sorted.entries; source.sortedEntriesBase = 0;
    source.counts = sorted.counts; source.countsBase = 0; source.size = sorted.size;
    source.tree = sorted.tree; source.treeBase = 0; source.leaves = sorted.leaves;
    source.cleared = sorted.cleared;
    source.watched.length = source.watchedBases.length = 0;
    for (const component of bound.watched) {
        source.watched.push(sorted.watched.get(component)?.tree ?? new Float64Array(0));
        source.watchedBases.push(0);
    }
};
