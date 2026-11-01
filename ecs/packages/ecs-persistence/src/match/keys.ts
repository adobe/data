// © 2026 Adobe. MIT License. See /LICENSE for details.

/** A table's key, a column of bytes for each part, `stride` bytes per row: a row's key is its bytes in each. */
export type KeyColumns = readonly { readonly bytes: Uint8Array; readonly stride: number }[];

/**
 * Keys of rows of tables, each with a number: an open-addressing table of slots, linear probing, at most half full,
 * each slot two words, a key's hash and its entry plus one, or 0 for none, so a probe reads its slots until a hash
 * matches. An entry is a row of the tables it was added from, whose bytes are its key.
 */
export type KeyTable = {
    readonly mask: number;
    readonly slots: Int32Array;
    readonly tables: Int32Array;
    readonly rows: Int32Array;
    readonly values: Float64Array;
    readonly columns: KeyColumns[];
    count: number;
};

/** A table for up to `capacity` keys. */
export const createKeyTable = (capacity: number): KeyTable => {
    let size = 16;
    while (size < 2 * capacity) size *= 2;
    return {
        mask: size - 1,
        slots: new Int32Array(2 * size),
        tables: new Int32Array(capacity),
        rows: new Int32Array(capacity),
        values: new Float64Array(capacity),
        columns: [],
        count: 0,
    };
};

/** FNV-1a over a row's bytes in each column, then mixed so its low bits, which pick a slot, depend on all of them. */
const hashOf = (columns: KeyColumns, row: number): number => {
    let hash = 0x811c9dc5;
    for (let c = 0; c < columns.length; c++) {
        const { bytes, stride } = columns[c];
        for (let at = row * stride, end = at + stride; at < end; at++) hash = Math.imul(hash ^ bytes[at], 0x01000193);
    }
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x85ebca6b);
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 0xc2b2ae35);
    return hash ^ (hash >>> 16);
};

const equalAt = (a: KeyColumns, rowA: number, b: KeyColumns, rowB: number): boolean => {
    if (a.length !== b.length) return false;
    for (let c = 0; c < a.length; c++) {
        const { bytes: left, stride } = a[c];
        const { bytes: right, stride: other } = b[c];
        if (stride !== other) return false;
        for (let k = 0, i = rowA * stride, j = rowB * stride; k < stride; k++) if (left[i + k] !== right[j + k]) return false;
    }
    return true;
};

/** The slot holding `row`'s key, or the empty one where it would go. */
const slotOf = (table: KeyTable, columns: KeyColumns, row: number, hash: number): number => {
    const { mask, slots, tables, rows } = table;
    for (let slot = hash & mask; ; slot = (slot + 1) & mask) {
        const entry = slots[2 * slot + 1] - 1;
        if (entry < 0) return slot;
        if (slots[2 * slot] === hash && equalAt(table.columns[tables[entry]], rows[entry], columns, row)) return slot;
    }
};

/**
 * Begins adding the rows of a table of `columns`; `addKey` then takes rows of it. Each table's columns are kept, since
 * its entries' keys are their rows' bytes.
 */
export const addKeyColumns = (table: KeyTable, columns: KeyColumns): void => {
    table.columns.push(columns);
};

/**
 * Adds row `row` of the table `addKeyColumns` began last, with `value`, unless a key equal to its is there: whether
 * it was added. Takes at most the capacity the table was created with.
 */
export const addKey = (table: KeyTable, row: number, value: number): boolean => {
    const at = table.columns.length - 1;
    const columns = table.columns[at];
    const hash = hashOf(columns, row);
    const slot = slotOf(table, columns, row, hash);
    if (table.slots[2 * slot + 1] !== 0) return false;
    const entry = table.count++;
    table.slots[2 * slot] = hash;
    table.slots[2 * slot + 1] = entry + 1;
    table.tables[entry] = at;
    table.rows[entry] = row;
    table.values[entry] = value;
    return true;
};

/**
 * The entry whose key is equal to row `row`'s of `columns`, or -1 for none. `guess` is an entry to compare first, such
 * as the one after the entry found for the row before: rows in the order they were added are found without hashing.
 */
export const findKey = (table: KeyTable, columns: KeyColumns, row: number, guess: number): number => {
    if (guess >= 0 && guess < table.count && equalAt(table.columns[table.tables[guess]], table.rows[guess], columns, row)) return guess;
    return table.slots[2 * slotOf(table, columns, row, hashOf(columns, row)) + 1] - 1;
};
