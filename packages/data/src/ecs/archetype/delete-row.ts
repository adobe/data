// © 2026 Adobe. MIT License. See /LICENSE for details.
import * as TABLE from "../../table/index.js";
import { Archetype } from "./archetype.js";
import { EntityLocationTable } from "../entity-location-table/entity-location-table.js";
import { Entity } from "../entity/entity.js";

/**
 * Deletes a row from the archetype and updates the entity location table for any row which may have been moved into it's position.
 * Does NOT modify the deleted row's entity location.
 *
 * Returns the entity that was swap-moved into the vacated row, or `undefined`
 * when the deleted row was the last row (no move). Callers surface this so
 * observers/persistence learn about the relocation the swap caused.
 */
export const deleteRow = <C>(archetype: Archetype<C>, row: number, entityLocationTable: EntityLocationTable): Entity | undefined => {
    const movedARowToFillHole = TABLE.deleteRow(archetype, row);
    if (movedARowToFillHole) {
        const movedId = archetype.columns.id.get(row);
        entityLocationTable.update(movedId, { archetype: archetype.id, row });
        return movedId;
    }
    return undefined;
}
