// © 2026 Adobe. MIT License. See /LICENSE for details.
import { RowIndex } from "./row-index.js";
import { Table } from "./table.js";

export const getRowData = <C>(table: Table<C>, rowIndex: RowIndex): C => {
    const rowData: C = {} as C;
    for (const name in table.columns) {
        rowData[name] = table.columns[name].get(rowIndex);
    }
    return rowData;
}