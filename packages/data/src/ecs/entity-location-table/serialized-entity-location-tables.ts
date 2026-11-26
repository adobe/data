// © 2026 Adobe. MIT License. See /LICENSE for details.
import { generationOf, isPersistentQuadrant, isRetiredGeneration, nextGeneration, quadrantOf, toLocalIndex } from "../entity/persistence-sharing.js";

/** A live persistent entity's location, as mirrored by a persistence layer. */
export interface EntityLocationEntry {
    readonly entity: number;
    readonly archetype: number;
    readonly row: number;
}

interface Slot {
    readonly local: number;
    readonly generation: number;
    readonly location?: { readonly archetype: number; readonly row: number };
}

/**
 * Build the per-quadrant serialized location tables (the shape core `fromData`
 * consumes) from a flat list of live persistent entity locations.
 *
 * A persistence layer mirrors entity locations keyed by entity id; on load it
 * hands that flat set here and this buckets each entity into its persistent
 * quadrant's local-index table. `vacancies` are the ids of deleted entities
 * whose slots are still free, so a reference to an entity deleted before the
 * save stays stale; a free slot not listed restarts at generation 0.
 * This keeps all quadrant/id-encoding knowledge inside `@adobe/data` — callers
 * never touch the bit layout.
 */
export const serializedEntityLocationTables = (
    entries: Iterable<EntityLocationEntry>,
    vacancies: Iterable<number> = [],
): { [quadrant: number]: unknown } => {
    const buckets = new Map<number, Slot[]>();
    const add = (entity: number, location?: Slot["location"]): void => {
        const quadrant = quadrantOf(entity);
        if (!isPersistentQuadrant(quadrant)) return;
        let bucket = buckets.get(quadrant);
        if (bucket === undefined) {
            bucket = [];
            buckets.set(quadrant, bucket);
        }
        // A vacancy's slot moved on to the generation after its deleted entity's.
        const generation = location === undefined ? nextGeneration(generationOf(entity)) : generationOf(entity);
        bucket.push({ local: toLocalIndex(entity), generation, location });
    };
    for (const { entity, archetype, row } of entries) add(entity, { archetype, row });
    for (const entity of vacancies) add(entity);

    const tables: { [quadrant: number]: unknown } = {};
    for (const [quadrant, bucket] of buckets) {
        tables[quadrant] = buildQuadrantTable(bucket);
    }
    return tables;
};

/**
 * Rebuild one quadrant's location-table snapshot (indexed by per-quadrant local
 * index). Holes below the high-water mark, except retired ones, are threaded into the free list so
 * post-load allocations reuse them and `nextIndex` never collides with a
 * restored id.
 */
const buildQuadrantTable = (
    slots: Slot[],
): { entities: Int32Array; generations: Uint32Array; freeListHead: number; nextIndex: number; capacity: number } => {
    let nextIndex = 0;
    let extent = 0;
    for (const s of slots) {
        if (s.location !== undefined) nextIndex = Math.max(nextIndex, s.local + 1);
        extent = Math.max(extent, s.local + 1);
    }
    let capacity = 16;
    while (capacity < Math.max(extent, 16)) capacity *= 2;
    const entities = new Int32Array(new ArrayBuffer(capacity * 2 * 4));
    const generations = new Uint32Array(new ArrayBuffer(capacity * 4));
    const occupied = new Uint8Array(nextIndex);
    for (const s of slots) {
        generations[s.local] = s.generation;
        if (s.location === undefined) continue;
        entities[s.local * 2 + 0] = s.location.archetype;
        entities[s.local * 2 + 1] = s.location.row;
        occupied[s.local] = 1;
    }
    let freeListHead = -1;
    for (let local = 0; local < nextIndex; local++) {
        if (occupied[local] === 1) continue;
        entities[local * 2 + 0] = -1;
        // A retired slot stays off the free list.
        if (isRetiredGeneration(generations[local])) {
            entities[local * 2 + 1] = -1;
            continue;
        }
        entities[local * 2 + 1] = freeListHead;
        freeListHead = local;
    }
    return { entities, generations, freeListHead, nextIndex, capacity };
};
