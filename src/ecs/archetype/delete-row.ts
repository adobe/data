// © 2026 Adobe. MIT License. See /LICENSE for details.
import * as TABLE from "../../table/index.js";
import { Archetype } from "./archetype.js";
import { RequiredComponents } from "../required-components.js";
import { EntityLocationTable } from "../entity-location-table/entity-location-table.js";

/**
 * Deletes a row from the archetype and updates the entity location table for any row which may have been moved into it's position.
 * Does NOT modify the deleted row's entity location.
 */
export const deleteRow = <C extends RequiredComponents>(archetype: Archetype<C>, row: number, entityLocationTable: EntityLocationTable): void => {
    const movedARowToFillHole = TABLE.deleteRow(archetype, row);
    if (movedARowToFillHole) {
        const movedId = archetype.columns.id.get(row);
        entityLocationTable.update(movedId, { archetype: archetype.id, row });
    }
}
