// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createTable } from "./create-table.js";
import { addRow } from "./add-row.js";

describe("createTable", () => {
    it("should create columns for each schema", () => {
        const schemas = {
            a: { type: "number" },
            b: { type: "string" },
        } as const;

        const table = createTable(schemas);

        expect(table.columns.a).toBeDefined();
        expect(table.columns.b).toBeDefined();
        expect(Object.keys(table.columns)).toHaveLength(2);
    });

    it("should initialize with 0 rows", () => {
        const schemas = { a: { type: "number" } } as const;
        const table = createTable(schemas);
        expect(table.rowCount).toBe(0);
    });

}); 