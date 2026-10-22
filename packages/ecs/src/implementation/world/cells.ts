import type { Storage } from './archetype.js';
import { readString, writeString } from './strings.js';

/** Where a value is: a storage, or a joined thread's view of one. */
export type Cell = Pick<Storage, "layout" | "views" | "values" | "strings">;

/** A component value, copied out of linear storage. */
export const readCell = (storage: Cell, row: number): unknown => {
    const { layout } = storage;
    switch (layout.kind) {
        case "linear": return layout.read(storage.views, row);
        case "string": return readString(storage, row);
        case "object": return storage.values[row];
        default: return layout.value;
    }
};

/** Replaces a component value. Doesn't touch ticks. */
export const writeCell = (storage: Cell, row: number, value: unknown): void => {
    const { layout } = storage;
    if (layout.kind === "linear") layout.write(storage.views, row, value);
    else if (layout.kind === "string") writeString(storage, row, value);
    else if (layout.kind === "object") storage.values[row] = value;
};
