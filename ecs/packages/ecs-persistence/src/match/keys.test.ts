// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { addKey, addKeyColumns, createKeyTable, findKey, type KeyColumns } from "./keys.js";

/** A column of `stride` bytes a row, each row's bytes from `bytesOf`. */
const column = (rows: number, stride: number, bytesOf: (row: number, k: number) => number): KeyColumns[number] => {
    const bytes = new Uint8Array(rows * stride);
    for (let row = 0; row < rows; row++) for (let k = 0; k < stride; k++) bytes[row * stride + k] = bytesOf(row, k);
    return { bytes, stride };
};

/** Each row's number as four little-endian bytes. */
const numbered = (rows: number, offset = 0): KeyColumns[number] => column(rows, 4, (row, k) => ((row + offset) >>> (8 * k)) & 0xFF);

describe("key tables", () => {
    it("find each key added, by its bytes in another table, and no other", () => {
        const table = createKeyTable(1_000);
        addKeyColumns(table, [numbered(1_000)]);
        for (let row = 0; row < 1_000; row++) expect(addKey(table, row, 10 + row)).toBe(true);
        // The same keys, from 500 on, in a table of their own.
        const other = [numbered(1_000, 500)];
        for (let row = 0; row < 1_000; row++) {
            const entry = findKey(table, other, row, -1);
            expect(entry < 0 ? undefined : table.values[entry]).toBe(row < 500 ? 510 + row : undefined);
        }
    });

    it("refuse a key equal to one added, from any table", () => {
        const table = createKeyTable(6);
        addKeyColumns(table, [numbered(3)]);
        for (let row = 0; row < 3; row++) addKey(table, row, row);
        addKeyColumns(table, [numbered(3, 2)]);
        expect(addKey(table, 0, 7)).toBe(false);
        expect(addKey(table, 1, 8)).toBe(true);
        expect(table.count).toBe(4);
    });

    it("key rows by every column's bytes, so keys sharing one column's differ", () => {
        const table = createKeyTable(4);
        const first = column(4, 1, () => 1);
        const second = column(4, 2, (row, k) => row + k);
        addKeyColumns(table, [first, second]);
        for (let row = 0; row < 4; row++) expect(addKey(table, row, row)).toBe(true);
        expect(findKey(table, [column(1, 1, () => 1), column(1, 2, (_, k) => 2 + k)], 0, -1)).toBe(2);
        expect(findKey(table, [column(1, 1, () => 0), column(1, 2, (_, k) => 2 + k)], 0, -1)).toBe(-1);
        // Columns of other strides hold other keys.
        expect(findKey(table, [column(1, 1, () => 1), column(1, 1, () => 2)], 0, -1)).toBe(-1);
    });

    it("find keys whose hashes share slots, through the slots after", () => {
        // Many keys in the smallest table: probes run past slots of other keys.
        const table = createKeyTable(8);
        addKeyColumns(table, [numbered(8, 1 << 20)]);
        for (let row = 0; row < 8; row++) expect(addKey(table, row, row)).toBe(true);
        for (let row = 0; row < 8; row++) expect(findKey(table, [numbered(8, 1 << 20)], row, -1)).toBe(row);
    });

    it("take a guess equal to the key at once, and look up past one that isn't", () => {
        const table = createKeyTable(3);
        addKeyColumns(table, [numbered(3)]);
        for (let row = 0; row < 3; row++) addKey(table, row, row);
        const keys = [numbered(3)];
        expect(findKey(table, keys, 1, 1)).toBe(1);
        expect(findKey(table, keys, 1, 2)).toBe(1);
        // Past the entries added.
        expect(findKey(table, keys, 2, 3)).toBe(2);
    });
});
