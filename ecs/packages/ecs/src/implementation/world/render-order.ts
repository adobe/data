// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { RenderContext, RenderTable } from '../../interface/system/render.js';
import type { Archetype } from './archetype.js';
import type { GpuEngine } from './gpu.js';
import type { Ordered } from './index-order.js';
import { blockBase } from './index-sorted.js';
import type { WorldIndex } from './indexes.js';

// A render system with `order` draws one table: instance `i` is the i-th matching entity in its sorted index's order.
// Its record is the instance count, the word addresses of its order block and tables block, and the bits a slot is
// shifted by. The order block holds, by position, a matched archetype's slot above `shift` bits and its row below
// them; the tables block holds, by slot, the word address of each accessor's column. The order block is built and
// written only when the index's entries changed or moved, or the matches grew; the tables block only when a column's
// address changed; the record only when one of its words did.

/** The table of a render system's run and its context, both reused. */
type MutableTable = { count: number; bind: (pass: GPURenderPassEncoder | GPUComputePassEncoder) => void };
type MutableContext = { device: GPUDevice; encoder: GPUCommandEncoder; tables: readonly RenderTable[] };

export type OrderedRender = {
    /**
     * Uploads what the run's one table reads; returns null, or the reason it can't be drawn: more matched archetypes
     * and rows than an entry's 32 bits hold.
     */
    readonly prepare: (gpu: GpuEngine, matches: readonly Archetype[], tick: number) => string | null;
    /** The body's context, once the work recorded before it is submitted. */
    readonly context: (gpu: GpuEngine) => RenderContext;
};

/**
 * `columns` are the accessors' component ids, in accessor order; `group` the bind group the shader declares; `key`
 * the prefix of the runner's GPU records.
 */
export const createOrderedRender = (index: WorldIndex, ordered: Ordered, columns: readonly number[], group: number, key: string): OrderedRender => {
    const width = columns.length;
    const orderKey = `${key}order`;
    const tablesKey = `${key}tables`;
    const recordKey = `${key}ordered`;
    let entries = new Int32Array(64);
    let instances = 0;
    let tables = new Int32Array(Math.max(1, width));
    /** What the order block was last built from: the index's ticks, the matches, and the GPU it was written to. */
    let builtChanged = -1;
    let builtMoved = -1;
    let builtMatches = -1;
    let builtGpu: GpuEngine | null = null;
    let shift = 31;
    const words = new Uint32Array(4);
    let recorded = false;
    const offsets = [0];
    let bound: GpuEngine | null = null;
    const table: MutableTable = {
        count: 0,
        bind: pass => {
            if (bound !== null) pass.setBindGroup(group, bound.renderGroup(), offsets);
        },
    };
    const list: readonly RenderTable[] = [table];
    let context: MutableContext | null = null;

    /** Lists the index's entries of matched archetypes, in its order, as slot and row. */
    const build = (matches: readonly Archetype[]): void => {
        const sorted = index.sorted;
        instances = 0;
        if (sorted === null) return;
        if (entries.length < sorted.size) entries = new Int32Array(Math.max(sorted.size, 2 * entries.length));
        const owners = ordered.owners(matches);
        const known = owners.length;
        const slotShift = shift;
        const { order, lengths, stride, words: keyWords, blocks } = sorted;
        const sortedEntries = sorted.entries;
        for (let k = 0; k < blocks; k++) {
            const block = order[k];
            const base = blockBase(sorted, block) + keyWords;
            for (let at = base, end = base + lengths[block] * stride; at < end; at += stride) {
                const archetype = sortedEntries[at + 1];
                const owner = archetype < known ? owners[archetype] : -1;
                if (owner < 0) continue;
                entries[instances++] = (owner << slotShift) | sortedEntries[at + 2];
            }
        }
    };

    const prepare = (gpu: GpuEngine, matches: readonly Archetype[], tick: number): string | null => {
        const slots = matches.length;
        if (gpu !== builtGpu) {
            builtGpu = gpu;
            builtChanged = -1;
            recorded = false;
        }
        // The tables block: every column's address, uploading rows the CPU changed first.
        if (tables.length < slots * width) {
            const grown = new Int32Array(Math.max(slots * width, 2 * tables.length));
            grown.set(tables);
            tables = grown;
        }
        let addressed = false;
        let most = 0;
        for (let slot = 0; slot < slots; slot++) {
            const archetype = matches[slot];
            const { count } = archetype;
            if (count > most) most = count;
            for (let k = 0; k < width; k++) {
                const storage = count === 0 ? undefined : archetype.storageById[columns[k]];
                const address = storage === undefined ? 0 : gpu.upload(archetype, storage, tick);
                const at = slot * width + k;
                if (tables[at] !== address) {
                    tables[at] = address;
                    addressed = true;
                }
            }
        }
        if (slots !== builtMatches) {
            // At least one bit of slot, so a row's mask is never 32 bits.
            const slotBits = Math.max(1, Math.ceil(Math.log2(slots)));
            shift = 32 - slotBits;
            builtMatches = slots;
            builtChanged = -1;
        }
        if (most > 2 ** shift) return `with ${slots} matching archetypes an ordered table names at most ${2 ** shift} rows of each, and one holds ${most}`;
        const rebuilt = index.changed !== builtChanged || index.moved !== builtMoved;
        if (rebuilt) {
            build(matches);
            builtChanged = index.changed;
            builtMoved = index.moved;
        }
        const orderAddress = gpu.uploadIndexes(orderKey, entries, instances, rebuilt);
        const tablesAddress = gpu.uploadIndexes(tablesKey, tables, slots * width, addressed);
        if (!recorded || words[0] !== instances || words[1] !== orderAddress || words[2] !== tablesAddress || words[3] !== shift) {
            words[0] = instances;
            words[1] = orderAddress;
            words[2] = tablesAddress;
            words[3] = shift;
            offsets[0] = gpu.record(recordKey, words);
            recorded = true;
        }
        bound = gpu;
        table.count = instances;
        return null;
    };

    const contextOf = (gpu: GpuEngine): RenderContext => {
        if (context === null) return context = { device: gpu.device, encoder: gpu.encoder(), tables: list };
        context.device = gpu.device;
        context.encoder = gpu.encoder();
        return context;
    };

    return { prepare, context: contextOf };
};
