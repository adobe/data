// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "../entity/entity.js";
import { EntityLocation } from "./entity-location.js";

export interface EntityLocationTable {
    create: (location: EntityLocation) => Entity;
    update: (entity: Entity, location: EntityLocation) => void;
    delete: (entity: Entity) => void;
    locate: (entity: Entity) => EntityLocation | null;
    /** Wipe all entity records. O(1). Next allocate starts from entity 0 again. */
    reset: () => void;
    toData: () => unknown;
    fromData: (data: unknown) => void;
}
