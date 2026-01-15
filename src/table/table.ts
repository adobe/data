// © 2026 Adobe. MIT License. See /LICENSE for details.
import { ReadonlyTypedBuffer, TypedBuffer } from "../typed-buffer/index.js";

export interface ReadonlyTable<C> {
    readonly columns: { readonly [K in keyof C]: ReadonlyTypedBuffer<C[K]> }
    readonly rowCount: number;
    readonly rowCapacity: number;
}

export interface Table<C> extends ReadonlyTable<C> {
    readonly columns: { readonly [K in keyof C]: TypedBuffer<C[K]> }
    rowCount: number;
    rowCapacity: number;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Table {

    export const hasColumn = <C, T extends keyof C>(table: Table<Partial<C>>, component: T): table is Table<C & { [K in T]: C[K] }> => {
        return component in table.columns && table.columns[component] !== undefined;
    }

    export const compact = <C>(table: Table<C>): void => {
        if (table.rowCapacity > table.rowCount) {
            for (const name in table.columns) {
                const column = table.columns[name];
                column.capacity = table.rowCount;
            }
            table.rowCapacity = table.rowCount;
        }
    };

}