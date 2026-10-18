import type { Storage } from './archetype.js';

/** Where a value is: a storage, or a joined thread's view of one. */
export type Cell = Pick<Storage, "layout" | "views" | "values">;

/** A component value, copied out of linear storage. */
export const readCell = (storage: Cell, row: number): unknown => {
    const { layout } = storage;
    return layout.kind === "linear" ? layout.read(storage.views, row) : layout.kind === "object" ? storage.values[row] : layout.value;
};

/** Replaces a component value. Doesn't touch ticks. */
export const writeCell = (storage: Cell, row: number, value: unknown): void => {
    const { layout } = storage;
    if (layout.kind === "linear") layout.write(storage.views, row, value);
    else if (layout.kind === "object") storage.values[row] = value;
};
