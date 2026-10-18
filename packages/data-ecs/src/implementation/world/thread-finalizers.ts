import type { Leaf } from '../../interface/finalizer/created.js';
import { labelOf } from '../../interface/registry/index.js';
import { viewsOf, type Layout } from '../../interface/registry/layout.js';
import { writeOf } from './archetype.js';
import { emptyViews } from './arrays.js';
import { readCell } from './cells.js';
import { logFinalizedWord, logStopsWord, nullTag, ownTag, slotTags, startTag } from './move-log.js';
import { stagedValue, type Mirror, type Previously } from './mirror.js';
import type { WorkerError } from './protocol.js';
import { rowBinderOf, type Row, type RowArchetype, type RowHost, type RowStorage } from './rows.js';
import {
    archetypesAt, blockGroupsWord, blockHeaderBytes, blockNextWord, blockSyncWord, columnBytes, entitiesAt, groupBytesWord, groupCountWord,
    groupIndexWord, rowsAt, tagsAt, valuesAt,
} from './stop-lists.js';
import type { Key } from './state.js';

// A joined thread's finalizers (threads.md, "Finalizers on other threads"): as it replays each sync, before that sync's
// entries apply, it runs them for the sync's stop list, reading the linear structs the world copied there and its own
// objects at the rows the stops name, then stores the sync it finalized through.

/** A storage of a joined thread's view, as its finalizers' rows read it. */
type FinalizedStorage = RowStorage & { readonly component: number };
/** An archetype of a joined thread's view, as its systems see it. */
type FinalizedArchetype = RowArchetype & { readonly components: readonly number[]; readonly resource: boolean; readonly storageById: readonly (FinalizedStorage | undefined)[] };

/** What a joined thread gives its finalizers. */
export type ThreadFinalizersHost<A extends FinalizedArchetype> = {
    readonly mirror: Mirror;
    /** Views of the memory, again once it grew. */
    readonly refresh: () => ArrayBufferLike;
    readonly rows: RowHost;
    readonly numberOf: (key: Key) => number;
    readonly layoutOf: (key: Key) => Layout | undefined;
    readonly archetypeAt: (id: number) => A | undefined;
    readonly countOf: (archetype: A) => number;
    readonly tableCount: () => number;
    readonly resourceRow: () => { readonly archetype: A; readonly row: number } | null;
    /** Posts what finalizers threw, by their index here, for the world's next report. */
    readonly failed: (errors: readonly (readonly [number, WorkerError])[]) => void;
};

const errorOf = (error: unknown): WorkerError =>
    error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { name: "Error", message: String(error) };

const noTicks = new Float64Array(0);
const noTags = new Uint32Array(0);

/** One finalizer here: what it matches and reads, its row binder, and its context. */
type ThreadFinalizer = {
    readonly leaf: Leaf;
    readonly required: readonly number[];
    readonly excluded: readonly number[];
    /** Its reads by component: objects, with their starts, linear structs, with their layouts, and constants. */
    readonly objects: readonly number[];
    readonly starts: readonly unknown[];
    readonly linear: readonly number[];
    readonly layouts: readonly Layout[];
    readonly constants: readonly number[];
    readonly constantLayouts: readonly Layout[];
    readonly bind: (archetype: RowArchetype) => Row;
    readonly context: object;
    /** Resolves its resources' cells, as of now. */
    readonly cells: () => void;
    readonly body: (row: object, context: object) => void;
};

/** A storage a stop list's column holds, for a row over its stops. */
const columnStorage = (component: number, layout: Layout, views: RowStorage["views"], values: unknown[]): FinalizedStorage => ({
    component, layout, views, values, ...writeOf(layout), ticked: false, added: noTicks, changed: noTicks, chunkAdded: noTicks, chunkChanged: noTicks, tags: noTags,
});

/**
 * The finalizers the world places on this thread, with what they run against: stop lists as the thread replays them,
 * and every row they match once the world is disposed.
 */
export const createThreadFinalizers = <A extends FinalizedArchetype>(host: ThreadFinalizersHost<A>) => {
    const { mirror } = host;
    const finalizers: (ThreadFinalizer | null | undefined)[] = [];
    /** The newest block run, which the next block's offset is read from; 0 before the first. */
    let anchor = 0;
    /** The sync finalized through, as stored. */
    let finalized = 0;
    let buffer: ArrayBufferLike = new ArrayBuffer(0);
    let u32: Uint32Array<ArrayBufferLike> = new Uint32Array(0);
    let f64: Float64Array<ArrayBufferLike> = new Float64Array(0);
    const errors: [number, WorkerError][] = [];

    const views = (): void => {
        const latest = host.refresh();
        if (latest === buffer && u32.length > 0) return;
        buffer = latest;
        u32 = new Uint32Array(latest);
        f64 = new Float64Array(latest, 0, latest.byteLength >> 3);
    };

    const create = (leaf: Leaf): ThreadFinalizer => {
        const { components, resources } = leaf.declaration;
        const reads = components.read ?? [];
        const objects: number[] = [];
        const starts: unknown[] = [];
        const linear: number[] = [];
        const layouts: Layout[] = [];
        const constants: number[] = [];
        const constantLayouts: Layout[] = [];
        for (const key of reads) {
            const component = host.numberOf(key);
            const layout = host.layoutOf(key);
            if (layout === undefined) throw new Error(`"${labelOf(key)}" has no layout here.`);
            if (layout.kind === "object") {
                objects.push(component);
                starts.push(mirror.starts.get(component) ?? null);
            }
            else if (layout.kind === "linear") {
                linear.push(component);
                layouts.push(layout);
            }
            else {
                constants.push(component);
                constantLayouts.push(layout);
            }
        }
        const value: object = Object.create({});
        const keys = [...new Set<Key>(resources?.read ?? [])];
        const numbers = keys.map(host.numberOf);
        const resolved: { storage: FinalizedStorage | undefined; row: number }[] = keys.map(() => ({ storage: undefined, row: 0 }));
        if (keys.length > 0) {
            const values: object = Object.create({});
            keys.forEach((key, k) => {
                Object.defineProperty(values, key, {
                    get: () => {
                        const { storage, row } = resolved[k];
                        if (storage === undefined) throw new Error(`Resource "${labelOf(key)}" isn't in this world.`);
                        return readCell(storage, row);
                    },
                    enumerable: true,
                });
            });
            Object.defineProperty(value, "resources", { value: values, enumerable: true });
        }
        // Method parameters are bivariant, so the runtime can see any finalizer's body with erased parameter types.
        const untyped: { body(row: object, context: object): void } = leaf;
        return {
            leaf, objects, starts, linear, layouts, constants, constantLayouts,
            required: [...new Set([...reads, ...components.has ?? []])].map(host.numberOf),
            excluded: (components.not ?? []).map(host.numberOf),
            bind: rowBinderOf<RowArchetype>(host.rows, host.numberOf, reads, []),
            context: value,
            cells: () => {
                const found = keys.length === 0 ? null : host.resourceRow();
                for (let k = 0; k < keys.length; k++) {
                    resolved[k].storage = found?.archetype.storageById[numbers[k]];
                    resolved[k].row = found?.row ?? 0;
                }
            },
            body: (row, context) => untyped.body(row, context),
        };
    };

    /** Records the finalizers the world places here; one this thread never imported fails each group of its stops. */
    const setup = (placed: readonly { readonly index: number; readonly leaf: Leaf | null }[]): void => {
        for (const { index, leaf } of placed) finalizers[index] = leaf === null ? null : create(leaf);
    };

    /** Runs a body, keeping what it throws. */
    const guarded = (index: number, finalizer: ThreadFinalizer, row: Row): void => {
        try {
            finalizer.body(row.value, finalizer.context);
        }
        catch (error) {
            errors.push([index, errorOf(error)]);
        }
    };

    /** One of an object read's values for a stop: by its tag, else at its row, or after a rebuild as it was. */
    const objectOf = (tag: number, start: unknown, entity: number, archetype: number, row: number, component: number, old: Previously | null): unknown => {
        if (tag === startTag) return start;
        if (tag === nullTag) return null;
        if (old === null) {
            const column = mirror.archetypes[archetype]?.byComponent[component];
            return column === undefined ? start : column.values[row];
        }
        const previous = old(entity, component, start);
        return tag === ownTag ? previous : stagedValue(mirror, (tag - slotTags) >>> 0, previous);
    };

    /** Whether every finalizer a block names was set up here, as null for one this thread never imported. */
    const known = (block: number): boolean => {
        const groups = u32[(block >> 2) + blockGroupsWord];
        let group = block + blockHeaderBytes;
        for (let g = 0; g < groups; g++) {
            if (finalizers[u32[(group >> 2) + groupIndexWord]] === undefined) return false;
            group += u32[(group >> 2) + groupBytesWord];
        }
        return true;
    };

    /** Runs each group of a block: the bodies of its finalizer for its stops, over a row reading the block's columns. */
    const runBlock = (block: number, old: Previously | null): void => {
        const groups = u32[(block >> 2) + blockGroupsWord];
        let group = block + blockHeaderBytes;
        for (let g = 0; g < groups; g++) {
            const index = u32[(group >> 2) + groupIndexWord];
            const count = u32[(group >> 2) + groupCountWord];
            const bytes = u32[(group >> 2) + groupBytesWord];
            const finalizer = finalizers[index];
            if (finalizer === null || finalizer === undefined) {
                // Set up, as null, for one this thread never imported.
                errors.push([index, errorOf(new Error(`A finalizer the world placed on this thread isn't one this thread imported, so ${count === 1 ? "a stop" : `${count} stops`} didn't run.`))]);
                group += bytes;
                continue;
            }
            const storageById: FinalizedStorage[] = [];
            const entityWords = entitiesAt(group) >> 3;
            const archetypeWords = archetypesAt(group, count) >> 2;
            const rowWords = rowsAt(group, count) >> 2;
            const { objects, starts, linear, layouts } = finalizer;
            for (let k = 0; k < objects.length; k++) {
                const tags = tagsAt(group, count, k) >> 2;
                const values: unknown[] = new Array<unknown>(count);
                for (let i = 0; i < count; i++) {
                    values[i] = objectOf(u32[tags + i], starts[k], f64[entityWords + i], u32[archetypeWords + i], u32[rowWords + i], objects[k], old);
                }
                storageById[objects[k]] = columnStorage(objects[k], { kind: "object" }, emptyViews, values);
            }
            let column = valuesAt(group, count, objects.length);
            for (let k = 0; k < linear.length; k++) {
                const layout = layouts[k];
                const stride = layout.kind === "linear" ? layout.stride : 0;
                storageById[linear[k]] = columnStorage(linear[k], layout, viewsOf(buffer, column, count * stride), []);
                column += columnBytes(count, stride);
            }
            for (let k = 0; k < finalizer.constants.length; k++) storageById[finalizer.constants[k]] = columnStorage(finalizer.constants[k], finalizer.constantLayouts[k], emptyViews, []);
            const row = finalizer.bind({ id: -1, entities: new Float64Array(buffer, entitiesAt(group), count), storageById });
            finalizer.cells();
            for (let i = 0; i < count; i++) {
                row.index = i;
                guarded(index, finalizer, row);
            }
            group += bytes;
        }
    };

    const report = (): void => {
        if (errors.length === 0) return;
        host.failed(errors.splice(0));
    };

    /** Stores the sync finalized through, once it moved on. */
    const acknowledge = (sync: number): void => {
        if (((sync - finalized) | 0) <= 0) return;
        finalized = sync >>> 0;
        Atomics.store(mirror.header, logFinalizedWord, finalized);
    };

    /**
     * Runs the stop lists of every sync through `sync` not run yet, in order, then stores it as finalized through: with
     * `old`, after the log lapped, reading this thread's objects as they were before the rebuild. False, having stopped
     * before it, at a block naming a finalizer whose setup hasn't arrived yet.
     */
    const through = (sync: number, old: Previously | null): boolean => {
        views();
        const { header } = mirror;
        let complete = true;
        for (;;) {
            const next = anchor === 0 ? Atomics.load(header, logStopsWord) >>> 0 : Atomics.load(u32, (anchor >> 2) + blockNextWord);
            if (next === 0) break;
            const blockSync = u32[(next >> 2) + blockSyncWord];
            if (((sync - blockSync) | 0) < 0) break;
            if (!known(next)) {
                acknowledge((blockSync - 1) >>> 0);
                complete = false;
                break;
            }
            runBlock(next, old);
            anchor = next;
        }
        if (complete) acknowledge(sync);
        report();
        return complete;
    };

    /** Whether a stop list is linked that this thread hasn't run. */
    const pending = (): boolean => {
        if (anchor === 0) return Atomics.load(mirror.header, logStopsWord) !== 0;
        views();
        return Atomics.load(u32, (anchor >> 2) + blockNextWord) !== 0;
    };

    /** Once the world is disposed: every finalizer runs for every row it matches, reading this thread's objects there. */
    const all = (): void => {
        views();
        for (let index = 0; index < finalizers.length; index++) {
            const finalizer = finalizers[index];
            if (finalizer === null || finalizer === undefined) continue;
            finalizer.cells();
            for (let id = 0; id < host.tableCount(); id++) {
                const archetype = host.archetypeAt(id);
                if (archetype === undefined || archetype.resource) continue;
                const { components } = archetype;
                if (!finalizer.required.every(component => components.includes(component)) || finalizer.excluded.some(component => components.includes(component))) continue;
                const count = host.countOf(archetype);
                if (count === 0) continue;
                const row = finalizer.bind(archetype);
                for (let i = 0; i < count; i++) {
                    row.index = i;
                    guarded(index, finalizer, row);
                }
            }
        }
        report();
    };

    return { setup, through, pending, all };
};
