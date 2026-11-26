// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "../entity/entity.js";
import { EntityLocation } from "./entity-location.js";

export interface EntityLocationTable {
    create: (location: EntityLocation) => Entity;
    update: (entity: Entity, location: EntityLocation) => void;
    delete: (entity: Entity) => void;
    /** Moves `entity`'s free slot to the head of the free list at `entity`'s generation, so the next create returns `entity`. */
    claim: (entity: Entity) => void;
    locate: (entity: Entity) => EntityLocation | null;
    /** Wipe all entity records; ids issued before the reset stay stale. Next allocate starts from local index 0 again. */
    reset: () => void;
    /**
     * Serialize the table. When `copy` is true the backing `entities` buffer is
     * detached (sliced) so the snapshot survives later mutation of the live
     * table; otherwise the snapshot references the live buffer (faster, but only
     * valid until the next mutation).
     */
    toData: (copy?: boolean) => unknown;
    fromData: (data: unknown) => void;
}
