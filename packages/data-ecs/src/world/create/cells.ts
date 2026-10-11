import type { Storage } from './archetype.js';

/** A component value, copied out of linear storage. */
export const readCell = (storage: Storage, row: number): unknown => {
    const { layout } = storage;
    return layout.kind === "linear" ? layout.read(storage.views, row) : layout.kind === "object" ? storage.values[row] : layout.value;
};

/** Replaces a component value. Doesn't touch ticks. */
export const writeCell = (storage: Storage, row: number, value: unknown): void => {
    const { layout } = storage;
    if (layout.kind === "linear") layout.write(storage.views, row, value);
    else if (layout.kind === "object") storage.values[row] = value;
};
