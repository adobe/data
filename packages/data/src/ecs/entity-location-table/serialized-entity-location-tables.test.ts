// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { serializedEntityLocationTables } from "./serialized-entity-location-tables.js";
import { createEntityLocationTable } from "./create-entity-location-table.js";
import { toEntity } from "../entity/persistence-sharing.js";

describe("serializedEntityLocationTables", () => {
    it("restores live entities at their generation and vacancies past their deleted one", () => {
        const live = toEntity(1, 0, 3);
        const tables = serializedEntityLocationTables(
            [{ entity: live, archetype: 4, row: 7 }],
            [toEntity(0, 0, 8)], // deleted at generation 8
        );
        const table = createEntityLocationTable(16, 0);
        table.fromData(tables[0]);
        expect(table.locate(live)).toEqual({ archetype: 4, row: 7 });
        expect(table.locate(toEntity(1, 0, 2))).toBeNull();
        expect(table.create({ archetype: 4, row: 8 })).toBe(toEntity(0, 0, 9));
    });

    it("skips non-persistent quadrants", () => {
        const tables = serializedEntityLocationTables([{ entity: toEntity(0, 1), archetype: 0, row: 0 }]);
        expect(tables[1]).toBeUndefined();
    });
});
