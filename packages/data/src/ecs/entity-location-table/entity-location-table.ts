// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "../entity.js";
import { EntityLocation } from "./entity-location.js";

export interface EntityLocationTable {
    create: (location: EntityLocation) => Entity;
    update: (entity: Entity, location: EntityLocation) => void;
    delete: (entity: Entity) => void;
    locate: (entity: Entity) => EntityLocation | null;
    toData: () => unknown;
    fromData: (data: unknown) => void;
}
