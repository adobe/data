// © 2026 Adobe. MIT License. See /LICENSE for details.
import { RowIndex } from "./row-index.js";
import { Table } from "./table.js";

/**
 * Updates a row in the table with partial data.
 * @param archetype Table containing the row.
 * @param row Index of the row to update.
 * @param rowData Partial data to merge into the row.
 */
export const updateRow = <C>(archetype: Table<C>, row: RowIndex, rowData: Partial<C>) => {
    for (const name in rowData) {
        const column = archetype.columns[name];
        column.set(row, rowData[name] as C[typeof name]);
    }
}
