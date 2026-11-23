// © 2026 Adobe. MIT License. See /LICENSE for details.
import { generationOf, isPersistentQuadrant, quadrantOf, toLocalIndex } from "../entity/persistence-sharing.js";

/**
 * A persistent entity slot, as mirrored by a persistence layer. An entry with
 * `archetype < 0` is a free slot: its `entity` carries the generation the slot's
 * next occupant gets, and `row` is ignored.
 */
export interface EntityLocationEntry {
    readonly entity: number;
    readonly archetype: number;
    readonly row: number;
}

/**
 * Build the per-quadrant serialized location tables (the shape core `fromData`
 * consumes) from a flat list of persistent entity slots.
 *
 * A persistence layer mirrors entity locations keyed by entity id; on load it
 * hands that flat set here and this buckets each entity into its persistent
 * quadrant's local-index table. This keeps all quadrant/id-encoding knowledge
 * inside `@adobe/data` — callers never touch the bit layout.
 */
export const serializedEntityLocationTables = (
    entries: Iterable<EntityLocationEntry>,
): { [quadrant: number]: unknown } => {
    const buckets = new Map<number, { local: number; generation: number; archetype: number; row: number }[]>();
    for (const { entity, archetype, row } of entries) {
        const quadrant = quadrantOf(entity);
        if (!isPersistentQuadrant(quadrant)) continue;
        let bucket = buckets.get(quadrant);
        if (bucket === undefined) {
            bucket = [];
            buckets.set(quadrant, bucket);
        }
        bucket.push({ local: toLocalIndex(entity), generation: generationOf(entity), archetype, row });
    }

    const tables: { [quadrant: number]: unknown } = {};
    for (const [quadrant, bucket] of buckets) {
        tables[quadrant] = buildQuadrantTable(bucket);
    }
    return tables;
};

/**
 * Rebuild one quadrant's location-table snapshot (indexed by per-quadrant local
 * index). Holes below the high-water mark are threaded into the free list so
 * post-load allocations reuse them and `nextIndex` never collides with a
 * restored id. Each slot keeps its entry's generation; slots without an entry
 * start at generation 0.
 */
const buildQuadrantTable = (
    entries: { local: number; generation: number; archetype: number; row: number }[],
): { entities: Int32Array; generations: Uint8Array; freeListHead: number; nextIndex: number; capacity: number } => {
    let nextIndex = 0;
    for (const e of entries) nextIndex = Math.max(nextIndex, e.local + 1);
    let capacity = 16;
    while (capacity <= Math.max(nextIndex, 16)) capacity *= 2;
    const entities = new Int32Array(new ArrayBuffer(capacity * 2 * 4));
    const generations = new Uint8Array(new ArrayBuffer(capacity));
    const occupied = new Uint8Array(nextIndex);
    for (const e of entries) {
        generations[e.local] = e.generation;
        if (e.archetype < 0) continue;
        entities[e.local * 2 + 0] = e.archetype;
        entities[e.local * 2 + 1] = e.row;
        occupied[e.local] = 1;
    }
    let freeListHead = -1;
    for (let local = 0; local < nextIndex; local++) {
        if (occupied[local] === 1) continue;
        entities[local * 2 + 0] = -1;
        entities[local * 2 + 1] = freeListHead;
        freeListHead = local;
    }
    return { entities, generations, freeListHead, nextIndex, capacity };
};
