// © 2026 Adobe. MIT License. See /LICENSE for details.
import { RowIndex } from "./row-index.js";
import { Table } from "./table.js";

/**
 * Deletes a row from the Table, replacing it with the last row in the Table.
 * @param table Table to delete from.
 * @param rowIndex Index of the row to delete.
 * @returns true if a row was moved into the deleted row's position, false if the row was the last row in the Table.
 */
export const deleteRow = <C>(table: Table<C>, rowIndex: RowIndex): boolean => {
    const lastRowIndex = --table.rowCount;
    if (rowIndex === lastRowIndex) {
        return false;
    }

    for (const name in table.columns) {
        const column = table.columns[name];
        column.copyWithin(rowIndex, lastRowIndex, lastRowIndex + 1);
    }
    return true;
}
