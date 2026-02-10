// © 2026 Adobe. MIT License. See /LICENSE for details.
import { ensureCapacity } from "./ensure-capacity.js";
import { RowIndex } from "./row-index.js";
import { Table } from "./table.js";

/**
 * Adds a row to the end of the Table.
 * @param table Table to add a row to.
 * @param rowData Data for the new row.
 */
export const addRow = <C>(table: Table<C>, rowData: C): RowIndex => {
    ensureCapacity(table, table.rowCount + 1);
    const rowIndex = table.rowCount;
    const newLength = rowIndex + 1;
    for (const name in rowData) {
        const column = table.columns[name];
        if (column) {
            column.set(rowIndex, rowData[name]);
        }
    }
    table.rowCount++;
    return rowIndex;
}
