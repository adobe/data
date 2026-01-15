// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { selectRows, getRowPredicateFromFilter } from "./select-rows.js";
import { createTable } from "./create-table.js";
import { addRow } from "./add-row.js";

describe("selectRows", () => {
    const table = createTable({
        id: { type: "integer" },
        name: { type: "string" },
        age: { type: "integer" },
        score: { type: "number" },
        category: { type: "string" },
        price: { type: "number" },
        inStock: { type: "boolean" },
        isActive: { type: "boolean" },
        value: { type: "number" }
    });

    // Add comprehensive test data
    addRow(table, { id: 1, name: "Alice", age: 25, score: 85.5, category: "electronics", price: 100, inStock: true, isActive: true, value: 10 });
    addRow(table, { id: 2, name: "Bob", age: 30, score: 92.0, category: "electronics", price: 200, inStock: false, isActive: true, value: 20 });
    addRow(table, { id: 3, name: "Alice", age: 35, score: 78.3, category: "books", price: 50, inStock: true, isActive: false, value: 30 });
    addRow(table, { id: 4, name: "Charlie", age: 22, score: 95.7, category: "electronics", price: 150, inStock: true, isActive: true, value: 40 });
    addRow(table, { id: 5, name: "David", age: 28, score: 88.2, category: "books", price: 75, inStock: false, isActive: false, value: 50 });

    it("should create columns for each schema", () => {
        const predicate = getRowPredicateFromFilter({
            a: 1,
            b: {
                ">": 5,
                "<": 10,
            }
        });
        expect(predicate.toString()).toBe(`function anonymous(table,row
) {
    const { columns } = table;
    const a = columns.a.get(row);
    if (a != 1) { return false; }
    const b = columns.b.get(row);
    if (b <= 5 || b >= 10) { return false; }
    return true;
}`);
    });

    it("should filter by equality conditions", () => {
        expect(Array.from(selectRows(table, { name: "Alice" }))).toEqual([0, 2]);
        expect(Array.from(selectRows(table, { category: "electronics" }))).toEqual([0, 1, 3]);
        expect(Array.from(selectRows(table, { inStock: true }))).toEqual([0, 2, 3]);
    });

    it("should filter by numeric comparisons", () => {
        expect(Array.from(selectRows(table, { age: { ">": 25 } }))).toEqual([1, 2, 4]);
        expect(Array.from(selectRows(table, { score: { ">=": 85, "<": 95 } }))).toEqual([0, 1, 4]);
        expect(Array.from(selectRows(table, { value: { ">": 20, "<": 50 } }))).toEqual([2, 3]);
    });

    it("should handle all comparison operators", () => {
        expect(Array.from(selectRows(table, { value: { "==": 30 } }))).toEqual([2]);
        expect(Array.from(selectRows(table, { value: { "!=": 30 } }))).toEqual([0, 1, 3, 4]);
        expect(Array.from(selectRows(table, { value: { "<": 30 } }))).toEqual([0, 1]);
        expect(Array.from(selectRows(table, { value: { ">": 30 } }))).toEqual([3, 4]);
        expect(Array.from(selectRows(table, { value: { "<=": 30 } }))).toEqual([0, 1, 2]);
        expect(Array.from(selectRows(table, { value: { ">=": 30 } }))).toEqual([2, 3, 4]);
    });

    it("should handle combined conditions across multiple columns", () => {
        expect(Array.from(selectRows(table, {
            category: "electronics",
            price: { ">=": 100, "<=": 200 },
            inStock: true
        }))).toEqual([0, 3]);
    });

    it("should handle boolean combinations", () => {
        expect(Array.from(selectRows(table, {
            isActive: true,
            inStock: false
        }))).toEqual([1]);
    });

    it("should handle string inequality", () => {
        expect(Array.from(selectRows(table, { name: { "!=": "Alice" } }))).toEqual([1, 3, 4]);
    });

    it("should handle empty results", () => {
        expect(Array.from(selectRows(table, { name: "Eve" }))).toEqual([]);
        expect(Array.from(selectRows(table, { age: { ">": 100 } }))).toEqual([]);
        expect(Array.from(selectRows(table, {
            category: "electronics",
            inStock: false,
            isActive: false
        }))).toEqual([]);
    });

    it("should handle boundary conditions", () => {
        expect(Array.from(selectRows(table, { value: { ">=": 10, "<=": 50 } }))).toEqual([0, 1, 2, 3, 4]);
        expect(Array.from(selectRows(table, { value: { ">": 10, "<": 50 } }))).toEqual([1, 2, 3]);
    });

    it("should handle where with no where", () => {
        expect(Array.from(selectRows(table, {}))).toEqual([0, 1, 2, 3, 4]);
    });

    it("should cache predicates for identical filter objects", () => {
        const filter1 = { name: "Alice", age: { ">": 25 } };
        const filter2 = { name: "Alice", age: { ">": 25 } };

        // These should be different objects but identical structure
        expect(filter1).not.toBe(filter2);

        const predicate1 = getRowPredicateFromFilter(filter1);
        const predicate2 = getRowPredicateFromFilter(filter2);

        // First calls should create new predicates
        expect(predicate1).not.toBe(predicate2);

        // Second calls with same objects should return cached predicates
        const predicate1Cached = getRowPredicateFromFilter(filter1);
        const predicate2Cached = getRowPredicateFromFilter(filter2);

        expect(predicate1Cached).toBe(predicate1);
        expect(predicate2Cached).toBe(predicate2);

        // Verify the cached predicates work correctly
        expect(Array.from(selectRows(table, filter1))).toEqual([2]);
        expect(Array.from(selectRows(table, filter2))).toEqual([2]);
    });
}); 