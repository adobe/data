// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "./entity.js";

// Entity ids carry a 2-bit quadrant in their low bits, partitioning entity
// space along two orthogonal axes:
//   bit 0 — durability: set = non-persistent (not saved), clear = persistent
//   bit 1 — sharing:    set = non-shared (local), clear = shared (replicated)
// The remaining high bits are the entity's per-quadrant local index. THIS FILE
// IS THE ONLY PLACE THAT KNOWS THIS LAYOUT — everything else goes through the
// helpers below (predicates for consumers; encode/decode for the location
// table and core). To change the layout, change it here.

/** Number of low bits reserved for the quadrant. */
const QUADRANT_BITS = 2;
/** Mask selecting the quadrant bits: `entity & QUADRANT_MASK` → quadrant. */
const QUADRANT_MASK = 0b11;
/** Quadrant bit 0 — set when the entity is non-persistent. */
const PERSISTENCE_BIT = 0b01;
/** Quadrant bit 1 — set when the entity is non-shared. */
const SHARING_BIT = 0b10;

export const isNonPersistent = (entity: Entity): boolean => (entity & PERSISTENCE_BIT) !== 0;
export const isPersistent = (entity: Entity): boolean => (entity & PERSISTENCE_BIT) === 0;
export const isNonShared = (entity: Entity): boolean => (entity & SHARING_BIT) !== 0;
export const isShared = (entity: Entity): boolean => (entity & SHARING_BIT) === 0;

/** Total number of quadrants (persistence × sharing). */
export const QUADRANT_COUNT = 1 << QUADRANT_BITS;

/** The quadrant (0..3) an entity id belongs to. */
export const quadrantOf = (entity: Entity): number => entity & QUADRANT_MASK;

/** Whether a quadrant (0..3) is a persistent one (its entities are serialized). */
export const isPersistentQuadrant = (quadrant: number): boolean => (quadrant & PERSISTENCE_BIT) === 0;

/** Compose the quadrant (0..3) from the two axis flags. */
export const quadrantFor = (nonPersistent: boolean, nonShared: boolean): number =>
    (nonPersistent ? PERSISTENCE_BIT : 0) | (nonShared ? SHARING_BIT : 0);

/** Pack a per-quadrant local index + quadrant into an entity id. */
export const toEntity = (localIndex: number, quadrant: number): Entity => (localIndex << QUADRANT_BITS) | quadrant;

/** Recover the per-quadrant local index from an entity id (unsigned). */
export const toLocalIndex = (entity: Entity): number => entity >>> QUADRANT_BITS;

/**
 * The quadrants whose entities are persisted (document = 0, settings = 2). A
 * persistence layer keeps one gap-free durable array per persistent quadrant,
 * each indexed by `toLocalIndex`, so every quadrant packs fully densely.
 */
export const persistentQuadrants: readonly number[] =
    Array.from({ length: QUADRANT_COUNT }, (_, quadrant) => quadrant).filter(isPersistentQuadrant);
