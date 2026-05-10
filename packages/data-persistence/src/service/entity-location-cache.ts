// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * In-memory mirror of every persisted entity's last-known on-disk
 * location, keyed by entity id. Used by the persistence service to
 * detect swap-remove side effects (an unrelated entity moving into
 * a vacated row) and to decide whether a per-component update path
 * can be taken vs. a full row write.
 *
 * Implementation: two `Uint32Array` slots per entity (archetype id,
 * row), packed flat and indexed directly by entity id. This avoids
 * a `Map<number, {a, r}>` — both a hash lookup and a per-entry
 * object allocation per change.
 *
 * The sentinel 0xFFFFFFFF means "absent". Archetype ids are u16 in
 * the on-disk manifest so the sentinel never collides with a real
 * archetype id.
 *
 * Backing buffer grows geometrically when the entity id outruns the
 * current capacity. Shrinking is intentionally not supported; the
 * worst case is bounded by the high-water-mark entity id.
 */

const SENTINEL = 0xffff_ffff;
const SLOTS_PER_ENTITY = 2;
const INITIAL_CAPACITY_ENTITIES = 256;

// Hidden-class friendly: assign every field once in the constructor,
// in the same order, and don't mutate the shape.
class EntityLocationCache {
    private buffer: Uint32Array;
    private capacityEntities: number;

    constructor() {
        this.capacityEntities = INITIAL_CAPACITY_ENTITIES;
        this.buffer = new Uint32Array(this.capacityEntities * SLOTS_PER_ENTITY);
        this.buffer.fill(SENTINEL);
    }

    /** Returns the archetype id for `entity`, or -1 if absent. */
    getArchetypeId(entity: number): number {
        if (entity < 0 || entity >= this.capacityEntities) return -1;
        const v = this.buffer[entity * SLOTS_PER_ENTITY]!;
        return v === SENTINEL ? -1 : v;
    }

    /** Returns the row index for `entity`. Caller must guard with has(). */
    getRow(entity: number): number {
        return this.buffer[entity * SLOTS_PER_ENTITY + 1]!;
    }

    has(entity: number): boolean {
        if (entity < 0 || entity >= this.capacityEntities) return false;
        return this.buffer[entity * SLOTS_PER_ENTITY]! !== SENTINEL;
    }

    set(entity: number, archetypeId: number, row: number): void {
        if (entity < 0) return;
        if (entity >= this.capacityEntities) this.grow(entity + 1);
        const i = entity * SLOTS_PER_ENTITY;
        this.buffer[i] = archetypeId;
        this.buffer[i + 1] = row;
    }

    delete(entity: number): void {
        if (entity < 0 || entity >= this.capacityEntities) return;
        this.buffer[entity * SLOTS_PER_ENTITY] = SENTINEL;
    }

    private grow(neededEntities: number): void {
        let nextCap = this.capacityEntities;
        while (nextCap < neededEntities) nextCap *= 2;
        const next = new Uint32Array(nextCap * SLOTS_PER_ENTITY);
        next.fill(SENTINEL);
        next.set(this.buffer);
        this.buffer = next;
        this.capacityEntities = nextCap;
    }
}

export const createEntityLocationCache = (): EntityLocationCache => new EntityLocationCache();

export type { EntityLocationCache };
