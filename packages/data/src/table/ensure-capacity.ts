// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Table } from "./table.js";

export const ensureCapacity = <C>(table: Table<C>, minimumCapacity: number) => {
    // we don't actually loop, we just need to check the first columns length.
    const currentCapacity = table.rowCapacity;
    if (currentCapacity < minimumCapacity) {
        // may need smart growth factor, faster when smaller, smaller when larger.
        const growthFactor = 2;
        const newCapacity = Math.max(minimumCapacity, currentCapacity * growthFactor);
        for (const name in table.columns) {
            const column = table.columns[name];
            column.capacity = newCapacity;
        }
        table.rowCapacity = newCapacity;
    }
}
